#include "tsfnHandle.h"

#include <memory>
#include <mutex>
#include <utility>

namespace sevenzip {

std::shared_ptr<TsfnHandle> TsfnHandle::Create(Napi::Env env, const char* name, bool referenced) {
    // Not make_shared: the constructor is private.
    std::shared_ptr<TsfnHandle> handle(new TsfnHandle());

    handle->tsfn_ =
        Napi::ThreadSafeFunction::New(env,
                                      // A no-op JS callback. Every call carries its own lambda, so this is
                                      // never invoked; N-API simply wants a function to associate the async
                                      // resource with.
                                      Napi::Function::New(env, [](const Napi::CallbackInfo& /*info*/) {}), name,
                                      0,  // unbounded queue: Call() must never fail for lack of room
                                      1,
                                      // Holding the handle by shared_ptr here is what makes the mutex below
                                      // safe to lock: it keeps the object alive until N-API is finished with
                                      // it, even if every other owner is long gone. The cycle it creates --
                                      // handle owns the function, the function's finalizer owns the handle --
                                      // is broken by this lambda being destroyed once it has run.
                                      [handle](Napi::Env /*env*/) {
                                          std::scoped_lock const lock(handle->mutex_);
                                          handle->alive_ = false;
                                      });

    handle->alive_ = true;
    if (!referenced) {
        handle->tsfn_.Unref(env);
    }
    return handle;
}

void TsfnHandle::Call(std::function<void(Napi::Env)> callback) noexcept {
    std::scoped_lock const lock(mutex_);
    if (!alive_) {
        return;
    }
    try {
        tsfn_.NonBlockingCall(
            [callback = std::move(callback)](Napi::Env env, Napi::Function /*unused*/) { callback(env); });
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Queuing the call allocates. There is nothing useful to do about a
        // failure -- the caller is a producer thread with no way to report it
        // -- and this is reached from noexcept contexts, so throwing on would
        // abort the process over a notification that did not get delivered.
    }
}

void TsfnHandle::Release() noexcept {
    std::scoped_lock const lock(mutex_);
    if (!alive_) {
        return;
    }
    // Cleared before the call rather than after: giving back the last thread
    // count is what starts the function's destruction, so this is the moment it
    // stops being ours to touch.
    alive_ = false;
    tsfn_.Release();
}

void TsfnHandle::Ref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (alive_) {
        tsfn_.Ref(env);
    }
}

void TsfnHandle::Unref(Napi::Env env) noexcept {
    std::scoped_lock const lock(mutex_);
    if (alive_) {
        tsfn_.Unref(env);
    }
}

}  // namespace sevenzip
