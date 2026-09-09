#include "asyncSignal.h"

#include <stdexcept>
#include <utility>

namespace sevenzip {

std::shared_ptr<AsyncSignal> AsyncSignal::Create(Napi::Env env, const char* name, bool referenced, Callback callback) {
    std::shared_ptr<AsyncSignal> signal(new AsyncSignal());
    signal->env_ = env;
    signal->callback_ = std::move(callback);
    uv_loop_t* loop = nullptr;
    napi_value resource = Napi::Object::New(env);
    napi_value label = Napi::String::New(env, name);
    napi_value function = nullptr;
    if (napi_get_uv_event_loop(env, &loop) != napi_ok ||
        napi_create_reference(env, resource, 1, &signal->resource_) != napi_ok ||
        napi_async_init(env, resource, label, &signal->context_) != napi_ok ||
        napi_create_function(env, name, NAPI_AUTO_LENGTH, Invoke, signal.get(), &function) != napi_ok ||
        napi_create_reference(env, function, 1, &signal->function_) != napi_ok ||
        napi_add_async_cleanup_hook(env, Cleanup, signal.get(), &signal->cleanup_) != napi_ok) {
        throw std::runtime_error("could not create the 7-Zip notification signal");
    }
    if (uv_async_init(loop, &signal->async_, Dispatch) != 0) {
        throw std::runtime_error("could not initialize the 7-Zip notification signal");
    }
    signal->async_.data = signal.get();
    signal->keepAlive_ = signal;
    if (!referenced) {
        uv_unref(reinterpret_cast<uv_handle_t*>(&signal->async_));
    }
    return signal;
}

AsyncSignal::~AsyncSignal() { Dispose(); }

void AsyncSignal::Notify() noexcept {
    std::scoped_lock const lock(mutex_);
    if (!closing_) {
        pending_ = true;
        // On an initialized, non-closing handle uv_async_send cannot run out
        // of queue space: it sets a pending bit and wakes the loop.
        uv_async_send(&async_);
    }
}

void AsyncSignal::Release() noexcept {
    std::scoped_lock const lock(mutex_);
    if (!closing_) {
        released_ = true;
        uv_async_send(&async_);
    }
}

napi_value AsyncSignal::Invoke(napi_env env, napi_callback_info info) {
    void* data = nullptr;
    if (napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data) != napi_ok) {
        return nullptr;
    }
    auto* signal = static_cast<AsyncSignal*>(data);
    {
        std::scoped_lock const lock(signal->mutex_);
        if (!signal->pending_ || signal->closing_) {
            return nullptr;
        }
        signal->pending_ = false;
    }
    // Callers handle/reject their own failures. Never unwind through a C ABI.
    try {
        if (signal->callback_(Napi::Env(env))) {
            signal->Notify();
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
    return nullptr;
}

void AsyncSignal::Dispatch(uv_async_t* handle) {
    auto* signal = static_cast<AsyncSignal*>(handle->data);
    bool pending;
    {
        std::scoped_lock const lock(signal->mutex_);
        pending = signal->pending_;
    }
    if (pending) {
        napi_handle_scope scope = nullptr;
        if (napi_open_handle_scope(signal->env_, &scope) == napi_ok) {
            napi_value function = nullptr;
            napi_value resource = nullptr;
            if (napi_get_reference_value(signal->env_, signal->function_, &function) == napi_ok &&
                napi_get_reference_value(signal->env_, signal->resource_, &resource) == napi_ok) {
                // A real Node callback scope preserves async_hooks and Promise
                // processing. During worker termination this can refuse to run
                // JS: leave pending set for cleanup instead of throwing.
                napi_make_callback(signal->env_, signal->context_, resource, function, 0, nullptr, nullptr);
            }
            napi_close_handle_scope(signal->env_, scope);
        }
    }
    bool close;
    {
        std::scoped_lock const lock(signal->mutex_);
        close = signal->released_ && !signal->pending_;
        if (signal->pending_) {
            uv_async_send(&signal->async_);
        }
    }
    if (close) {
        signal->Close();
    }
}

void AsyncSignal::Ref(Napi::Env /*env*/) noexcept {
    std::scoped_lock const lock(mutex_);
    if (!closing_) {
        uv_ref(reinterpret_cast<uv_handle_t*>(&async_));
    }
}

void AsyncSignal::Unref(Napi::Env /*env*/) noexcept {
    std::scoped_lock const lock(mutex_);
    if (!closing_) {
        uv_unref(reinterpret_cast<uv_handle_t*>(&async_));
    }
}

void AsyncSignal::Cleanup(napi_async_cleanup_hook_handle /*hook*/, void* data) {
    static_cast<AsyncSignal*>(data)->Close();
}

void AsyncSignal::Close() {
    {
        std::scoped_lock const lock(mutex_);
        if (closing_) {
            return;
        }
        closing_ = true;
        uv_close(reinterpret_cast<uv_handle_t*>(&async_), Closed);
    }
    // No producer can touch the handle after closing_ is set. Clear JS-owned
    // state on the loop before cleanup allows any environment finalization.
    try {
        callback_(Napi::Env(nullptr));
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
    callback_ = {};
}

void AsyncSignal::Dispose() {
    if (function_) {
        napi_delete_reference(env_, function_);
        function_ = nullptr;
    }
    if (context_) {
        napi_async_destroy(env_, context_);
        context_ = nullptr;
    }
    if (resource_) {
        napi_delete_reference(env_, resource_);
        resource_ = nullptr;
    }
    if (cleanup_) {
        napi_remove_async_cleanup_hook(cleanup_);
        cleanup_ = nullptr;
    }
}

void AsyncSignal::Closed(uv_handle_t* handle) {
    auto* signal = static_cast<AsyncSignal*>(handle->data);
    signal->Dispose();
    signal->keepAlive_.reset();
}

}  // namespace sevenzip
