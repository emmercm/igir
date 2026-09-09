#include "lister.h"

#include <atomic>
#include <chrono>
#include <deque>
#include <exception>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include "7zip/PropID.h"
#include "addon.h"
#include "asyncSignal.h"
#include "errors.h"
#include "sevenZip.h"

namespace sevenzip {

namespace {

struct Entry {
    // The archive's own item index, stored rather than recovered from this
    // queue's position, so that it stays correct however the list is later
    // filtered or ordered
    uint32_t index = 0;
    std::optional<std::string> entryPath;
    std::optional<uint64_t> size;
    std::optional<uint32_t> crc32;
    bool isDirectory = false;
    bool isEncrypted = false;
};

// One listing, on a dedicated thread rather than on the libuv thread pool. A
// listing holds its thread from the archive open through the last property read,
// and for a large solid .7z the open alone decodes a compressed header, far
// longer than the short tasks the pool's four default threads are sized for, so
// concurrent listings would stall unrelated fs, dns and zlib work.
//
// The price is one AsyncSignal per listing, and this class owning its own
// lifetime.
class ListJob {
   public:
    // Starts the listing. On success the returned promise settles when the
    // result batches finish; on failure to start, it is rejected before returning.
    static Napi::Promise Start(Napi::Env env, std::string path, uint32_t formatIndex);

    ListJob(const ListJob&) = delete;
    ListJob& operator=(const ListJob&) = delete;
    ListJob(ListJob&&) = delete;
    ListJob& operator=(ListJob&&) = delete;
    ~ListJob() {
        // Also covers registration/shared_ptr allocation failures before the
        // worker starts. Release is idempotent after normal worker completion.
        if (signal_) {
            signal_->Release();
        }
    }

    // Asks the listing to stop. Returns immediately; the thread notices at its
    // next item, or inside the open through the abort flag handed to
    // OpenArchive(). Safe to call from any thread and more than once.
    void Cancel() noexcept { abort_.store(true, std::memory_order_relaxed); }

   private:
    ListJob(Napi::Env env, Napi::Promise::Deferred deferred, std::string path, uint32_t formatIndex)
        : deferred_(deferred),
          path_(std::move(path)),
          formatIndex_(formatIndex),
          failure_(Napi::Persistent(Napi::Error::New(env, "failed to build the entry list").Value())) {}

    // The thread body. Nothing may escape it: an exception leaving a
    // std::thread's callable calls std::terminate(). Not marked noexcept, which
    // would turn such a throw into that same terminate(); it catches internally.
    void Run();

    // The listing, which reports failure by throwing; Run() catches
    void List();

    // Marshals the result back to the event loop and settles the promise
    bool Emit(Napi::Env env);

    std::shared_ptr<AsyncSignal> signal_;
    Napi::Promise::Deferred deferred_;
    std::string path_;
    uint32_t formatIndex_;
    std::deque<Entry> entries_;
    std::string error_;
    bool failed_ = false;
    bool settled_ = false;
    Napi::ObjectReference failure_;
    Napi::ObjectReference result_;
    uint32_t emitted_ = 0;
    std::atomic<bool> abort_{false};
    std::shared_ptr<JobRegistry> registry_;
    JobRegistry::Token token_ = JobRegistry::kInvalidToken;
};

void ListJob::List() {
    OpenedArchive opened;
    // The abort flag makes the open interruptible; without it a cancel during a
    // large solid archive's header decode would not be seen until it finished
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
    // Deliberately not entries_.reserve(count): `count` comes out of an
    // untrusted header, and a corrupt archive claiming 4 billion items would
    // ask for ~200 GB before a single property is read. Growing instead costs
    // an amortized reallocation, bounded by what the archive can produce.
    for (uint32_t i = 0; i < count; i++) {
        // Checked per item, because an untrusted count makes this loop the one
        // place a listing can run long after the open has succeeded
        if (abort_.load(std::memory_order_relaxed)) {
            error_ = "the archive listing was cancelled";
            return;
        }

        Entry entry;
        entry.index = i;

        std::string entryPath;
        if (GetStringProp(*opened.archive, i, kpidPath, &entryPath)) {
            // An empty string stays an empty string: the format did record a
            // name, and that name is "". Only a missing kpidPath is undefined.
            //
            // Normalized rather than passed through, because some handlers
            // rewrite `/` to the host's separator on the way out, so the same
            // archive would list `sub/file.bin` on Linux and `sub\file.bin` on
            // Windows.
            entry.entryPath = NormalizeEntryPath(std::move(entryPath));
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
    // result reaches the event loop
}

void ListJob::Run() {
    try {
        try {
            List();
        } catch (const std::exception& e) {
            error_ = e.what();
        } catch (...) {
            // Several vendored calls throw non-std exceptions by design, and
            // archives are untrusted input
            error_ = "failed to list the archive's entries";
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Assigning to error_ allocates, so the handlers above can throw in
        // turn. Escaping this thread's entry point would call std::terminate().
        failed_ = true;
    }
    signal_->Notify();
}

bool ListJob::Emit(Napi::Env env) {
    // Bound both JS object creation and disposal of native entries per turn.
    // No up-front Array(count) allocation or final O(count) native destructor.
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(2);
    if (!result_ && !failed_ && error_.empty()) {
        result_ = Napi::Persistent(Napi::Array::New(env).As<Napi::Object>());
    }
    for (size_t batch = 0; batch < 128 && !entries_.empty(); ++batch) {
        if (failed_ || !error_.empty()) {
            entries_.pop_front();
            if (std::chrono::steady_clock::now() >= deadline) {
                break;
            }
            continue;
        }
        Napi::Object const out = result_.Value();
        const Entry& entry = entries_.front();
        Napi::Object const object = Napi::Object::New(env);
        object.Set("entryIndex", Napi::Number::New(env, entry.index));
        // Undefined rather than "" when the format records no name: "" is a
        // name an entry could really have
        object.Set("entryPath", entry.entryPath.has_value() ? Napi::Value(Napi::String::New(env, *entry.entryPath))
                                                            : env.Undefined());
        // Undefined rather than 0 when the format records no size: 0 is a real
        // length, and a single-stream member genuinely can be empty
        object.Set("size", entry.size.has_value()
                               ? Napi::Value(Napi::Number::New(env, static_cast<double>(*entry.size)))
                               : env.Undefined());
        // A number, left for JavaScript to format as hex
        object.Set("crc32",
                   entry.crc32.has_value() ? Napi::Value(Napi::Number::New(env, *entry.crc32)) : env.Undefined());
        object.Set("isDirectory", Napi::Boolean::New(env, entry.isDirectory));
        object.Set("isEncrypted", Napi::Boolean::New(env, entry.isEncrypted));
        out.Set(emitted_++, object);
        entries_.pop_front();
        if (std::chrono::steady_clock::now() >= deadline) {
            break;
        }
    }
    if (!entries_.empty()) {
        return true;
    }
    if (failed_ || !error_.empty()) {
        Napi::Value error = failure_.Value();
        if (!error_.empty()) {
            error = Napi::Error::New(env, error_).Value();
        }
        settled_ = true;
        deferred_.Reject(error);
    } else {
        settled_ = true;
        deferred_.Resolve(result_.Value());
    }
    result_.Reset();
    return false;
}

Napi::Promise ListJob::Start(Napi::Env env, std::string path, uint32_t formatIndex) {
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    // Construct JS-owned state on the loop before registering the producer.
    std::shared_ptr<ListJob> const job(new ListJob(env, deferred, std::move(path), formatIndex));

    // A null registry means the environment's instance data is already gone,
    // i.e. teardown. Treated like the refused registration below rather than as
    // licence to run unregistered.
    job->registry_ = Registry(env);
    if (job->registry_) {
        // Registered before the thread starts, so no running listing is
        // invisible to teardown. Captured weakly because teardown may reach for
        // this after the job's last reference has gone; locking a dead weak_ptr
        // is then a no-op.
        std::weak_ptr<ListJob> const weak = job;
        job->token_ = job->registry_->Register([weak]() noexcept {
            if (std::shared_ptr<ListJob> const alive = weak.lock()) {
                alive->Cancel();
            }
        });
    }
    if (job->token_ == JobRegistry::kInvalidToken) {
        deferred.Reject(Napi::Error::New(env, "the 7-Zip addon is shutting down").Value());
        return deferred.Promise();
    }

    try {
        // Installed before the producer starts: signaling never allocates a
        // callback. The signal owns the job until its final loop-thread close.
        job->signal_ = AsyncSignal::Create(env, "sevenzip::ListEntries", true, [job](Napi::Env callbackEnv) {
            if (callbackEnv == nullptr) {
                job->result_.Reset();
                job->failure_.Reset();
                return false;
            }
            try {
                return job->Emit(callbackEnv);
            } catch (...) {
                if (job->settled_) {
                    return false;
                }
                // Keep cleanup batched even when marshaling fails midway.
                if (!job->failed_) {
                    job->failed_ = true;
                    job->error_.clear();
                    return true;
                }
                try {
                    job->settled_ = true;
                    job->deferred_.Reject(job->failure_.Value());
                } catch (...) {  // NOLINT(bugprone-empty-catch)
                    // JS may no longer run during worker termination.
                }
                return false;
            }
        });
        // Captured as its own non-const copy so that it can be released below;
        // capturing the const `job` by copy would make the lambda's member const
        // too, `mutable` or not
        std::thread([job = std::shared_ptr<ListJob>(job)]() mutable {
            job->Run();
            // Request closure after queued batches drain. Teardown can also
            // close the signal independently while cancelling the producer.
            job->signal_->Release();
            // Copied out before the reference is dropped, because dropping it
            // may be what destroys the ListJob they are read from
            std::shared_ptr<JobRegistry> const registry = job->registry_;
            JobRegistry::Token const token = job->token_;
            // Also before unregistering: letting the captured shared_ptr fall
            // out of scope on its own would order ~ListJob after the
            // Unregister() below, which teardown reads as "the thread is done"
            job.reset();
            // Dead last: teardown is then free to let the environment finish
            // going away, so nothing may be ordered after it
            if (registry) {
                registry->Unregister(token);
            }
        }).detach();
    } catch (...) {
        // Signal initialization or thread creation failed. Nothing started,
        // so this is the only place the registration can be given back, and
        // the promise must be rejected here since no thread will settle it.
        if (job->registry_) {
            job->registry_->Unregister(job->token_);
        }
        if (job->signal_) {
            job->signal_->Release();
        }
        deferred.Reject(Napi::Error::New(env, "failed to start listing the archive").Value());
    }
    return deferred.Promise();
}

}  // namespace

Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex) {
    return ListJob::Start(env, std::move(path), formatIndex);
}

}  // namespace sevenzip
