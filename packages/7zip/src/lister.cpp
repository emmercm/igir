#include "lister.h"

#include <atomic>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "7zip/PropID.h"
#include "addon.h"
#include "errors.h"
#include "sevenZip.h"

namespace sevenzip {

namespace {

struct Entry {
    // The archive's own item index, stored rather than recovered from this
    // vector's position: entries are emitted in listing order today, but the
    // number a caller passes back to EntryReader has to mean the archive's
    // index no matter how this list is later filtered or ordered.
    uint32_t index = 0;
    std::optional<std::string> entryPath;
    std::optional<uint64_t> size;
    std::optional<uint32_t> crc32;
    bool isDirectory = false;
    bool isEncrypted = false;
};

// One listing, on its own thread.
//
// This used to be a Napi::AsyncWorker, which put it on the libuv thread pool.
// The pool defaults to four threads and is shared with every fs call, every
// dns.lookup and every zlib stream in the process, and it is sized on the
// assumption that its tasks are short -- one syscall, then release. A listing
// is not short: it holds its thread from the archive open through the last
// property read, and for a large solid .7z the open alone decodes a compressed
// header. Igir scans several archives at once, so listings could occupy the
// entire pool and stall unrelated filesystem work process-wide.
//
// A dedicated thread costs one ThreadSafeFunction per listing and makes this
// class responsible for its own lifetime, which is the same trade Pump already
// makes for extraction. Extraction was never on the pool; this makes listing
// consistent with it.
class ListJob : public std::enable_shared_from_this<ListJob> {
   public:
    // Starts the listing. On success the returned promise settles when the
    // thread finishes; on failure to start, it is rejected before returning.
    static Napi::Promise Start(Napi::Env env, std::string path, uint32_t formatIndex);

    ListJob(const ListJob&) = delete;
    ListJob& operator=(const ListJob&) = delete;
    ListJob(ListJob&&) = delete;
    ListJob& operator=(ListJob&&) = delete;
    ~ListJob() = default;

    // Asks the listing to stop. Returns immediately; the thread notices at its
    // next property read, or inside the open through the abort flag handed to
    // OpenArchive(). Safe to call from any thread and more than once.
    void Cancel() noexcept { abort_.store(true, std::memory_order_relaxed); }

   private:
    ListJob(Napi::Env env, Napi::Promise::Deferred deferred, std::string path, uint32_t formatIndex)
        : deferred_(deferred), path_(std::move(path)), formatIndex_(formatIndex) {
        // Thread count of 1: the listing thread, released as its last act. It
        // stays referenced -- unlike EntryReader's, which is unreferenced
        // between reads -- because a listing's promise is pending from start to
        // finish, and letting the process exit with it unsettled would be a
        // behavior change from the AsyncWorker this replaces.
        tsfn_ = Napi::ThreadSafeFunction::New(env,
                                              // A no-op JS callback: every call carries its own lambda, so this
                                              // is never invoked. N-API only wants a function to associate the
                                              // async resource with.
                                              Napi::Function::New(env, [](const Napi::CallbackInfo& /*info*/) {}),
                                              "sevenzip::ListEntries",
                                              0,  // unbounded queue: NonBlockingCall must never fail for lack of room
                                              1);
    }

    // The thread body. Nothing may escape it: an exception leaving a
    // std::thread's callable calls std::terminate(). Not marked noexcept, which
    // would turn such a throw into that same terminate(); it catches internally.
    void Run();

    // The listing itself, so that Run() needs exactly one try/catch.
    void List();

    // Marshals the result back to the event loop and settles the promise.
    void Settle();

    void Emit(Napi::Env env);

    Napi::ThreadSafeFunction tsfn_;
    Napi::Promise::Deferred deferred_;
    std::string path_;
    uint32_t formatIndex_;
    std::vector<Entry> entries_;
    std::string error_;
    std::atomic<bool> abort_{false};
    std::shared_ptr<JobRegistry> registry_;
    JobRegistry::Token token_ = JobRegistry::kInvalidToken;
};

void ListJob::List() {
    OpenedArchive opened;
    // The abort flag makes the open interruptible; without it a cancel during a
    // large solid archive's header decode would not be seen until it finished.
    HRESULT const hr = OpenArchive(path_, formatIndex_, &opened, &abort_);
    if (hr != S_OK) {
        if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
            error_ = "the archive listing was cancelled";
            return;
        }
        error_ = OpenErrorMessage(hr, path_, formatIndex_);
        return;
    }

    uint32_t count = 0;
    if (opened.archive->GetNumberOfItems(&count) != S_OK) {
        error_ = "could not read the archive's item count; it is likely corrupt";
        return;
    }
    // Deliberately NOT entries_.reserve(count): `count` comes out of an
    // untrusted header, and a corrupt archive claiming 4 billion items would
    // otherwise ask for ~200 GB before a single property is read. Growing the
    // vector costs an amortized reallocation and is bounded by what the archive
    // can actually produce.
    for (uint32_t i = 0; i < count; i++) {
        // Checked per item rather than per batch: the count is attacker-
        // controlled, so this loop is the one place a listing can run long
        // after the open has succeeded.
        if (abort_.load(std::memory_order_relaxed)) {
            error_ = "the archive listing was cancelled";
            return;
        }

        Entry entry;
        entry.index = i;

        std::string entryPath;
        if (GetStringProp(*opened.archive, i, kpidPath, &entryPath)) {
            // An empty string stays an empty string: the format DID record a
            // name and that name is "". Only a missing kpidPath is undefined.
            entry.entryPath = std::move(entryPath);
        }
        uint64_t size = 0;
        if (GetUInt64Prop(*opened.archive, i, kpidSize, &size)) {
            entry.size = size;
        }
        uint32_t crc = 0;
        if (GetUInt32Prop(*opened.archive, i, kpidCRC, &crc)) {
            entry.crc32 = crc;
        }
        entry.isDirectory = GetBoolProp(*opened.archive, i, kpidIsDir);
        entry.isEncrypted = GetBoolProp(*opened.archive, i, kpidEncrypted);
        entries_.push_back(std::move(entry));
    }
    // `opened` is destroyed here: every file handle is released before the
    // result reaches the event loop.
}

void ListJob::Run() {
    try {
        try {
            List();
        } catch (const std::exception& e) {
            error_ = e.what();
        } catch (...) {
            // Several vendored calls throw by design --
            // ConvertUnicodeToUTF8() throws when its two length-calculation
            // passes disagree, and any allocation can throw 7-Zip's
            // kMemException -- and archives are untrusted input.
            error_ = "failed to list the archive's entries";
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Assigning to error_ allocates, so the handlers above can throw in
        // turn. There is nothing left to report it with, and escaping this
        // thread's entry point would call std::terminate().
    }

    try {
        Settle();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Settle() only queues work; a failure means the environment is going
        // away, and there is no promise left to settle.
    }
}

void ListJob::Settle() {
    // Keeps this object alive until the callback has run, whether or not the
    // caller still holds a reference.
    std::shared_ptr<ListJob> const self = shared_from_this();
    // NonBlockingCall never blocks and, with an unbounded queue, never fails
    // for want of room. If it fails at all the environment is going away, in
    // which case nothing is waiting on the promise any more.
    tsfn_.NonBlockingCall([self](Napi::Env env, Napi::Function /*unused*/) {
        // Event loop thread. Nothing may escape into N-API's C ABI: this is
        // called through a C function pointer, and with
        // NAPI_DISABLE_CPP_EXCEPTIONS an escaping exception aborts the process.
        try {
            self->Emit(env);
        } catch (...) {
            try {
                self->deferred_.Reject(Napi::Error::New(env, "failed to build the entry list").Value());
            } catch (...) {  // NOLINT(bugprone-empty-catch)
                // Rejecting allocates too. Nothing further can be done, and
                // aborting the process over it would be worse than a promise
                // that never settles.
            }
        }
    });
}

void ListJob::Emit(Napi::Env env) {
    if (!error_.empty()) {
        deferred_.Reject(Napi::Error::New(env, error_).Value());
        return;
    }

    Napi::Array const out = Napi::Array::New(env, entries_.size());
    for (size_t i = 0; i < entries_.size(); i++) {
        const Entry& entry = entries_[i];
        Napi::Object const object = Napi::Object::New(env);
        object.Set("entryIndex", Napi::Number::New(env, entry.index));
        // Undefined rather than "" when the format records no name, for the
        // same reason as `size`: "" is a name an entry could really have.
        object.Set("entryPath", entry.entryPath.has_value() ? Napi::Value(Napi::String::New(env, *entry.entryPath))
                                                            : env.Undefined());
        // Left undefined rather than 0 when the format records no size:
        // 0 is a real length, and .Z/.bz2/.lzma members genuinely can be
        // empty. Only the caller can tell "empty" from "unknown".
        object.Set("size", entry.size.has_value()
                               ? Napi::Value(Napi::Number::New(env, static_cast<double>(*entry.size)))
                               : env.Undefined());
        // Handed to JS as a number and formatted as 8 lowercase hex chars
        // in index.ts. Presentation is cheaper to write, test and change in
        // TypeScript than in C++.
        object.Set("crc32",
                   entry.crc32.has_value() ? Napi::Value(Napi::Number::New(env, *entry.crc32)) : env.Undefined());
        object.Set("isDirectory", Napi::Boolean::New(env, entry.isDirectory));
        object.Set("isEncrypted", Napi::Boolean::New(env, entry.isEncrypted));
        out.Set(static_cast<uint32_t>(i), object);
    }
    deferred_.Resolve(out);
}

Napi::Promise ListJob::Start(Napi::Env env, std::string path, uint32_t formatIndex) {
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    // Creating the ThreadSafeFunction happens in the constructor, so from here
    // on there is a thread count of 1 outstanding that something must release.
    std::shared_ptr<ListJob> const job(new ListJob(env, deferred, std::move(path), formatIndex));

    job->registry_ = Registry(env);
    if (job->registry_) {
        // Registered before the thread starts, so no running listing is ever
        // invisible to teardown. Captured weakly: teardown may reach for this
        // after the job's last reference has gone, and locking a dead weak_ptr
        // is the no-op that makes that safe.
        std::weak_ptr<ListJob> const weak = job;
        job->token_ = job->registry_->Register([weak]() noexcept {
            if (std::shared_ptr<ListJob> const alive = weak.lock()) {
                alive->Cancel();
            }
        });
        if (job->token_ == JobRegistry::kInvalidToken) {
            job->tsfn_.Release();
            deferred.Reject(Napi::Error::New(env, "the 7-Zip addon is shutting down").Value());
            return deferred.Promise();
        }
    }

    try {
        std::thread([job]() {
            job->Run();
            // Released before unregistering, because the release is one of the
            // things teardown is waiting to see happen.
            job->tsfn_.Release();
            // Dead last: teardown reads this as "the thread is done" and is
            // then free to let the environment finish going away, so nothing
            // may be ordered after it.
            if (job->registry_) {
                job->registry_->Unregister(job->token_);
            }
        }).detach();
    } catch (...) {
        // The OS refused a thread. Nothing was started, so this is the only
        // place the registration and the ThreadSafeFunction's thread count can
        // be given back -- and the promise is rejected here rather than left
        // pending, since no thread will ever settle it.
        if (job->registry_) {
            job->registry_->Unregister(job->token_);
        }
        job->tsfn_.Release();
        deferred.Reject(Napi::Error::New(env, "failed to start listing the archive").Value());
    }
    return deferred.Promise();
}

}  // namespace

Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex) {
    return ListJob::Start(env, std::move(path), formatIndex);
}

}  // namespace sevenzip
