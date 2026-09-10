#pragma once

#include <napi.h>
#include <uv.h>

#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {

/**
 * Preallocated, coalescing communication from a worker to the JavaScript loop.
 * Notify never allocates or enqueues a callback; only the loop thread touches
 * N-API or closes the libuv handle.
 */
class AsyncSignal {
   public:
    /** Callback invoked on the loop; true schedules another turn, and a null environment denotes final cleanup. */
    using Callback = std::function<bool(Napi::Env)>;

    /** Creates and initializes a signal on `env`'s loop, optionally keeping that loop alive. */
    static std::shared_ptr<AsyncSignal> Create(Napi::Env env, const char* name, bool referenced, Callback callback);

    /** Releases any N-API resources left after libuv has closed the handle. */
    ~AsyncSignal();

    /** Signals are bound to one libuv handle and therefore cannot be copied. */
    AsyncSignal(const AsyncSignal&) = delete;

    /** Signals are bound to one libuv handle and therefore cannot be copy-assigned. */
    AsyncSignal& operator=(const AsyncSignal&) = delete;

    /** Marks work pending and wakes the event loop without allocation or blocking. */
    void Notify() noexcept;

    /** Marks the producer done; pending notifications and continuations drain before close. */
    void Release() noexcept;

    /** Keeps the event loop alive while JavaScript has a pending read; loop thread only. */
    void Ref(Napi::Env env) noexcept;

    /** Removes the temporary event-loop reference held for a pending read; loop thread only. */
    void Unref(Napi::Env env) noexcept;

   private:
    /** Constructs inert storage; Create performs all fallible initialization. */
    AsyncSignal() = default;

    /** Handles a libuv wakeup and enters JavaScript through the registered async context. */
    static void Dispatch(uv_async_t* handle);

    /** Runs the user callback inside Node's callback scope and records whether another turn is needed. */
    static napi_value Invoke(napi_env env, napi_callback_info info);

    /** Begins loop-thread closure when the JavaScript environment starts teardown. */
    static void Cleanup(napi_async_cleanup_hook_handle hook, void* data);

    /** Disposes N-API state and breaks self-ownership after libuv finishes closing. */
    static void Closed(uv_handle_t* handle);

    /** Idempotently marks the signal closed and asks libuv to close its handle. */
    void Close();

    /** Deletes references, the async context, and the cleanup hook exactly once. */
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
