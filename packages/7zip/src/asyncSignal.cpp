#include "asyncSignal.h"

#include <stdexcept>
#include <utility>

namespace sevenzip {
std::shared_ptr<AsyncSignal> AsyncSignal::Create(Napi::Env env, const char* name, bool referenced, Callback callback) {
    std::shared_ptr<AsyncSignal> signal(new AsyncSignal());
    signal->env_ = env;
    signal->callback_ = std::move(callback);
    napi_value label = Napi::String::New(env, name);
    if (napi_create_threadsafe_function(env, nullptr, nullptr, label, 1, 1, signal.get(), Finalize, signal.get(),
                                        Dispatch, &signal->function_) != napi_ok) {
        throw std::runtime_error("could not create the 7-Zip notification signal");
    }
    signal->keepAlive_ = signal;
    if (napi_add_env_cleanup_hook(env, Cleanup, signal.get()) != napi_ok) {
        Cleanup(signal.get());
        throw std::runtime_error("could not install the 7-Zip signal cleanup hook");
    }
    signal->cleanupInstalled_ = true;
    if (!referenced) signal->Unref(env);
    return signal;
}

void AsyncSignal::Schedule() {
    if (function_ == nullptr || queued_) return;
    const napi_status status = napi_call_threadsafe_function(function_, nullptr, napi_tsfn_nonblocking);
    if (status == napi_ok || status == napi_queue_full) {
        queued_ = true;
    } else if (status == napi_closing) {
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

void AsyncSignal::Dispatch(napi_env env, napi_value /*function*/, void* context, void* /*data*/) {
    auto* signal = static_cast<AsyncSignal*>(context);
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
    std::scoped_lock const lock(signal->mutex_);
    signal->pending_ = signal->pending_ || again;
    if (signal->pending_) {
        signal->Schedule();
    } else if (signal->released_ && signal->function_ != nullptr) {
        napi_release_threadsafe_function(std::exchange(signal->function_, nullptr), napi_tsfn_release);
    }
}

void AsyncSignal::Ref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (function_ != nullptr) napi_ref_threadsafe_function(env, function_);
}
void AsyncSignal::Unref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (function_ != nullptr) napi_unref_threadsafe_function(env, function_);
}
void AsyncSignal::Cleanup(void* data) {
    auto* signal = static_cast<AsyncSignal*>(data);
    std::scoped_lock const lock(signal->mutex_);
    signal->cleanupInstalled_ = false;
    if (signal->function_ != nullptr) {
        napi_release_threadsafe_function(std::exchange(signal->function_, nullptr), napi_tsfn_abort);
    }
}
void AsyncSignal::Finalize(napi_env /*env*/, void* data, void* /*hint*/) {
    auto* signal = static_cast<AsyncSignal*>(data);
    {
        std::scoped_lock const lock(signal->mutex_);
        signal->function_ = nullptr;
    }
    if (signal->cleanupInstalled_) napi_remove_env_cleanup_hook(signal->env_, Cleanup, signal);
    try {
        signal->callback_(Napi::Env(nullptr));
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
    signal->callback_ = {};
    signal->keepAlive_.reset();
}
}  // namespace sevenzip
