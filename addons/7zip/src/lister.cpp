#include "lister.h"

#include <atomic>
#include <chrono>
#include <deque>
#include <exception>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

#include "7zip/PropID.h"
#include "addon.h"
#include "asyncSignal.h"
#include "errors.h"
#include "listEntry.h"
#include "poolTask.h"
#include "sevenZip.h"

namespace sevenzip {

namespace {

using detail::Entry;

/**
 * Owns one listing task and incrementally marshals results on the event loop.
 *
 * The archive is opened and its items read on the libuv thread pool, as Node.js
 * runs its own fs calls; the listing never waits on JavaScript, so it cannot
 * hold a pool thread hostage. The job self-owns and uses one AsyncSignal for
 * delivery.
 */
class ListJob {
   public:
    /**
     * Creates, registers, and starts a job. Its promise rejects immediately on a startup failure,
     * and otherwise settles once every entry has been marshaled, batch by batch.
     */
    static Napi::Promise Start(Napi::Env env, std::string path, uint32_t formatIndex);

    /** Listing jobs own a unique worker and signal and therefore cannot be copied. */
    ListJob(const ListJob&) = delete;

    /** Listing jobs own a unique worker and signal and therefore cannot be copy-assigned. */
    ListJob& operator=(const ListJob&) = delete;

    /** Listing jobs own stable addresses captured by callbacks and therefore cannot be moved. */
    ListJob(ListJob&&) = delete;

    /** Listing jobs own stable addresses captured by callbacks and therefore cannot be move-assigned. */
    ListJob& operator=(ListJob&&) = delete;

    /** Requests idempotent signal closure on every construction or worker-exit path. */
    ~ListJob() {
        // Release is idempotent, so this is harmless after the worker or a
        // failed start has already released, and it covers any path that hasn't
        if (signal_) {
            signal_->Release();
        }
    }

    /** Idempotently requests cancellation from any thread, observed while opening or before the next item. */
    void Cancel() noexcept { abort_.store(true, std::memory_order_relaxed); }

   private:
    /** Stores immutable inputs and preallocates the fallback JavaScript error object. */
    ListJob(Napi::Env env, Napi::Promise::Deferred deferred, std::string path, uint32_t formatIndex)
        : deferred_(deferred),
          path_(std::move(path)),
          formatIndex_(formatIndex),
          failure_(Napi::Persistent(Napi::Error::New(env, "failed to build the entry list").Value())) {}

    /** Contains all worker exceptions, records terminal state, and notifies the loop. */
    void Run();

    /** Closes the signal after queued batches drain and gives back the registration; the job's final action. */
    static void Exit(std::shared_ptr<ListJob> job) noexcept;

    /** Opens the archive and copies item properties into native records, reporting failure by throwing to Run. */
    void List();

    /** Marshals and settles a time- and count-bounded entry batch; true requests another loop turn. */
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
    // entries_ grows as items are read rather than being sized from `count`:
    // `count` comes out of an untrusted header, and a corrupt archive claiming
    // 4 billion items would otherwise ask for ~200 GB before a single property
    // is read.
    for (uint32_t i = 0; i < count; i++) {
        // Checked per item, because an untrusted count makes this loop the one
        // place a listing can run long after the open has succeeded
        if (abort_.load(std::memory_order_relaxed)) {
            error_ = "the archive listing was cancelled";
            return;
        }

        Entry entry;
        detail::ReadEntry(*opened.archive, i, entry);
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
        // turn, and the pool task must not throw
        failed_ = true;
    }
    signal_->Notify();
}

void ListJob::Exit(std::shared_ptr<ListJob> job) noexcept {
    // Request closure after queued batches drain. Teardown can also close the
    // signal independently while cancelling the listing.
    job->signal_->Release();

    // Copied out before the reference is dropped, because dropping it may be
    // what destroys the ListJob they are read from
    std::shared_ptr<JobRegistry> const registry = job->registry_;
    JobRegistry::Token const token = job->token_;

    // Also before unregistering: letting the shared_ptr fall out of scope on
    // its own would order ~ListJob after the Unregister() below, which
    // teardown reads as "the listing is done"
    job.reset();

    // Dead last: teardown is then free to let the environment finish going
    // away, so nothing may be ordered after it
    if (registry) {
        registry->Unregister(token);
    }
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
        detail::WriteEntry(env, entry, object);
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
    // license to run unregistered.
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
        // Installed before the producer starts. Notifications coalesce in the
        // runtime queue; the signal owns the job until its loop-thread finalizer.
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

        // Captured as their own non-const copies so that they can be released
        // by Exit(); capturing the const `job` by copy would make the lambdas'
        // members const too, `mutable` or not
        PoolTask::Queue(
            env, "sevenzip::ListEntries",
            [job = std::shared_ptr<ListJob>(job)]() mutable {
                job->Run();
                Exit(std::move(job));
            },
            [job = std::shared_ptr<ListJob>(job)]() mutable {
                // The pool never ran the listing, which only teardown causes,
                // so there is no promise left to settle
                Exit(std::move(job));
            });
    } catch (...) {
        // Signal initialization or queueing the task failed. Nothing ran, so
        // the promise must be rejected here since no task will settle it.
        // Unregister() and Release() are idempotent, so this is harmless after
        // an abandoned task has already given both back.
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
