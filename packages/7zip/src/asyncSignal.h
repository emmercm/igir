#pragma once

#include <napi.h>
#include <uv.h>

#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {

// A preallocated, coalescing wakeup: Notify never allocates or enqueues a
// callback. Only the loop thread touches N-API or closes the uv handle.
class AsyncSignal {
   public:
    // The callback returns true to request another turn (not another call in
    // the same turn). A null env is the final, loop-thread cleanup callback.
    using Callback = std::function<bool(Napi::Env)>;
    static std::shared_ptr<AsyncSignal> Create(Napi::Env env, const char* name, bool referenced, Callback callback);
    ~AsyncSignal();
    AsyncSignal(const AsyncSignal&) = delete;
    AsyncSignal& operator=(const AsyncSignal&) = delete;

    void Notify() noexcept;
    // Producer is done. Pending notifications/continuations drain before close.
    void Release() noexcept;
    // Loop thread only.
    void Ref(Napi::Env env) noexcept;
    void Unref(Napi::Env env) noexcept;

   private:
    AsyncSignal() = default;
    static void Dispatch(uv_async_t* handle);
    static napi_value Invoke(napi_env env, napi_callback_info info);
    static void Cleanup(napi_async_cleanup_hook_handle hook, void* data);
    static void Closed(uv_handle_t* handle);
    void Close();
    void Dispose();

    napi_env env_ = nullptr;
    napi_ref function_ = nullptr;
    napi_ref resource_ = nullptr;
    napi_async_context context_ = nullptr;
    napi_async_cleanup_hook_handle cleanup_ = nullptr;
    uv_async_t async_{};
    std::mutex mutex_;
    bool closing_ = false;
    bool pending_ = false;
    bool released_ = false;
    Callback callback_;
    // Broken in Closed, never before libuv has finished with async_.
    std::shared_ptr<AsyncSignal> keepAlive_;
};

}  // namespace sevenzip
