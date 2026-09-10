#pragma once
#include <napi.h>

#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {
/** Coalesces worker notifications through a nonblocking Node-API thread-safe function. */
class AsyncSignal {
   public:
    /** Returns true for another delivery; a null environment requests final cleanup. */
    using Callback = std::function<bool(Napi::Env)>;
    /** Creates the runtime notification queue and optionally keeps the loop alive. */
    static std::shared_ptr<AsyncSignal> Create(Napi::Env env, const char* name, bool referenced, Callback callback);
    /** Destroys storage after the runtime finalizer releases self-ownership. */
    ~AsyncSignal() = default;
    /** Signals own unique runtime queues and cannot be copied. */
    AsyncSignal(const AsyncSignal&) = delete;
    /** Signals own unique runtime queues and cannot be copy-assigned. */
    AsyncSignal& operator=(const AsyncSignal&) = delete;
    /** Coalesces pending work without waiting for JavaScript delivery. */
    void Notify() noexcept;
    /** Marks producer completion; pending delivery drains before releasing the queue. */
    void Release() noexcept;
    /** Keeps the loop alive for a pending read; loop thread only. */
    void Ref(Napi::Env env) noexcept;
    /** Removes a pending read's loop reference; loop thread only. */
    void Unref(Napi::Env env) noexcept;

   private:
    /** Constructs inert state before Create performs fallible initialization. */
    AsyncSignal() = default;
    /** Queues at most one delivery; requires mutex_ to protect queue ownership. */
    void Schedule();
    /** Delivers work in the runtime callback scope and drains continuations. */
    static void Dispatch(napi_env env, napi_value function, void* context, void* data);
    /** Clears JavaScript state and breaks self-ownership after queue destruction. */
    static void Finalize(napi_env env, void* data, void* hint);
    napi_threadsafe_function function_ = nullptr;
    std::mutex mutex_;
    bool queued_ = false;
    bool pending_ = false;
    bool released_ = false;
    Callback callback_;
    std::weak_ptr<AsyncSignal> self_;
};
}  // namespace sevenzip
