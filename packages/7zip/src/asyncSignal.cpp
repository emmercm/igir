#include "asyncSignal.h"

#include <new>
#include <stdexcept>
#include <utility>

namespace sevenzip {
std::shared_ptr<AsyncSignal> AsyncSignal::Create(Napi::Env env, const char* name, bool referenced, Callback callback) {
    std::shared_ptr<AsyncSignal> signal(new AsyncSignal());
    signal->self_ = signal;
    signal->callback_ = std::move(callback);
    auto context = std::make_unique<std::shared_ptr<AsyncSignal>>(signal);
    napi_value label = Napi::String::New(env, name);
    if (napi_create_threadsafe_function(env, nullptr, nullptr, label, 1, 1, context.get(), Finalize, nullptr, Dispatch,
                                        &signal->function_) != napi_ok) {
        throw std::runtime_error("could not create the 7-Zip notification signal");
    }
    // NOLINTNEXTLINE(bugprone-unused-return-value): the N-API finalizer now owns the context.
    context.release();
    if (!referenced) signal->Unref(env);
    return signal;
}

void AsyncSignal::Schedule() {
    if (function_ == nullptr || queued_) return;
    const std::shared_ptr<AsyncSignal> self = self_.lock();
    if (!self) return;
    auto* delivery = new (std::nothrow) std::shared_ptr<AsyncSignal>(self);
    if (delivery == nullptr) return;
    const napi_status status = napi_call_threadsafe_function(function_, delivery, napi_tsfn_nonblocking);
    if (status == napi_ok) {
        queued_ = true;
        return;
    }
    delete delivery;
    if (status == napi_closing) {
        // The runtime owns teardown now; further calls are forbidden.
        function_ = nullptr;
    }
}

void AsyncSignal::Notify() noexcept {
    std::scoped_lock const lock(mutex_);
    pending_ = true;
    Schedule();
}

void AsyncSignal::Release() noexcept {
    std::scoped_lock const lock(mutex_);
    released_ = true;
    Schedule();
}

void AsyncSignal::Dispatch(napi_env env, napi_value /*function*/, void* /*context*/, void* data) {
    // A queued delivery owns the signal independently of finalization. Node can
    // deliver a closing queue item with a null environment after invoking the
    // thread-safe function's finalizer.
    const std::unique_ptr<std::shared_ptr<AsyncSignal>> delivery(static_cast<std::shared_ptr<AsyncSignal>*>(data));
    if (!delivery) return;
    const std::shared_ptr<AsyncSignal>& signal = *delivery;
    bool pending = false;
    {
        std::scoped_lock const lock(signal->mutex_);
        signal->queued_ = false;
        pending = std::exchange(signal->pending_, false);
        if (env == nullptr || signal->function_ == nullptr) return;
    }
    bool again = false;
    if (pending) {
        try {
            again = signal->callback_(Napi::Env(env));
        } catch (...) {  // NOLINT(bugprone-empty-catch)
            // Callers translate failures; never unwind across the C ABI.
        }
    }
    napi_threadsafe_function release = nullptr;
    {
        std::scoped_lock const lock(signal->mutex_);
        signal->pending_ = signal->pending_ || again;
        if (signal->pending_) {
            signal->Schedule();
        } else if (signal->released_ && signal->function_ != nullptr) {
            release = std::exchange(signal->function_, nullptr);
        }
    }
    // Releasing the final producer can synchronously start finalization on
    // some runtimes. The finalizer locks mutex_, so release only after the
    // dispatch lock has been destroyed.
    if (release != nullptr) napi_release_threadsafe_function(release, napi_tsfn_release);
}

void AsyncSignal::Ref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (function_ != nullptr) napi_ref_threadsafe_function(env, function_);
}
void AsyncSignal::Unref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (function_ != nullptr) napi_unref_threadsafe_function(env, function_);
}
void AsyncSignal::Finalize(napi_env /*env*/, void* data, void* /*hint*/) {
    const std::unique_ptr<std::shared_ptr<AsyncSignal>> context(static_cast<std::shared_ptr<AsyncSignal>*>(data));
    const std::shared_ptr<AsyncSignal>& signal = *context;
    {
        std::scoped_lock const lock(signal->mutex_);
        signal->function_ = nullptr;
    }
    try {
        signal->callback_(Napi::Env(nullptr));
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
    signal->callback_ = {};
}
}  // namespace sevenzip
