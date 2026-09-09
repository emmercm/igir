#pragma once

#include <napi.h>

#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {

// A ThreadSafeFunction that a thread outliving the environment can still touch.
//
// N-API's contract is that every thread using a ThreadSafeFunction holds a
// reference and gives it back when it is done. What it does not say is that
// Node destroys the function from an environment cleanup hook regardless of how
// many references are still outstanding, so a worker thread that is still
// unwinding can be left holding a Release() that would write through a dangling
// pointer, which is an abort() with no message under glibc.
//
// So the function is never touched except under `mutex_`, and its finalizer
// (which N-API runs immediately before freeing it) takes that same mutex to
// clear `alive_`. Use and destruction are then mutually exclusive: a thread
// either arrives while the function is whole, or finds it gone and does
// nothing. Doing nothing is right rather than a leak: Node has already
// reclaimed everything the missing Release() would have, and there is no event
// loop left for a queued call to run on.
class TsfnHandle {
   public:
    // Creates the function with a thread count of 1, for whichever thread will
    // call Release(). Must be called on the event loop thread.
    //
    // `referenced` false unreferences it immediately, so that merely holding
    // one open does not by itself keep the process alive; callers that do have
    // something outstanding on the loop take that back with Ref().
    //
    // Returns nullptr if N-API refused to create the function, with a
    // JavaScript exception already pending. Nothing is outstanding on that
    // path: there is no thread count to give back and no Release() to make.
    static std::shared_ptr<TsfnHandle> Create(Napi::Env env, const char* name, bool referenced);

    TsfnHandle(const TsfnHandle&) = delete;
    TsfnHandle& operator=(const TsfnHandle&) = delete;
    TsfnHandle(TsfnHandle&&) = delete;
    TsfnHandle& operator=(TsfnHandle&&) = delete;
    ~TsfnHandle() = default;

    // Queues `callback` to run on the event loop thread. Callable from any
    // thread; never blocks, never throws, and does nothing once the function is
    // gone, since there would be no loop left to run the callback on.
    void Call(std::function<void(Napi::Env)> callback) noexcept;

    // Gives back the thread count Create() took out. Callable from any thread,
    // at most once, and a no-op if the function is already gone.
    void Release() noexcept;

    // Event loop thread only. Ref() undoes Create()'s unreference for as long
    // as something is genuinely waiting on the loop; Unref() gives it back.
    void Ref(Napi::Env env) noexcept;
    void Unref(Napi::Env env) noexcept;

   private:
    TsfnHandle() = default;

    std::mutex mutex_;
    // False before Create() has finished and after the function has been
    // released or destroyed. Guarded by mutex_ rather than atomic on purpose:
    // the check and the use that follows it have to be one indivisible step, or
    // the destruction this exists to exclude fits between them.
    bool alive_ = false;
    Napi::ThreadSafeFunction tsfn_;
};

}  // namespace sevenzip
