#pragma once

#include <napi.h>

#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {

// A ThreadSafeFunction that a thread outliving the environment can still touch.
//
// N-API's contract is that every thread using a ThreadSafeFunction holds a
// reference and gives it back when it is done, and the two jobs here do exactly
// that from their own thread. What the contract does not mention is that Node
// destroys the function itself from an environment cleanup hook, with no regard
// for how many references are still outstanding -- and that this addon's drain
// hook cannot get in front of that. The drain is an *async* cleanup hook, which
// suspends the end of teardown but not the rest of the hook chain, so the
// function is freed while the drain is still waiting for the very thread that
// owes it a Release(). That Release() then writes through a dangling pointer.
// Under glibc it is an immediate abort() carrying no message at all, which is
// why it surfaced only as a test worker vanishing mid-run.
//
// So the function is never touched except under `mutex_`, and its finalizer --
// which N-API runs immediately before freeing it, whatever order the cleanup
// hooks happened to come in -- takes that same mutex to clear `alive_`. Use and
// destruction are then mutually exclusive: a thread either arrives while the
// function is whole, or finds it gone and does nothing. Doing nothing is the
// right answer rather than a leak, because Node has already reclaimed
// everything the missing Release() would have, and there is no longer an event
// loop for a queued call to run on.
class TsfnHandle {
   public:
    // Creates the function with a thread count of 1, for whichever thread will
    // call Release(). Must be called on the event loop thread.
    //
    // `referenced` false unreferences it immediately, so that merely holding
    // one open does not by itself keep the process alive; callers that do have
    // something outstanding on the loop take that back with Ref().
    static std::shared_ptr<TsfnHandle> Create(Napi::Env env, const char* name, bool referenced);

    TsfnHandle(const TsfnHandle&) = delete;
    TsfnHandle& operator=(const TsfnHandle&) = delete;
    TsfnHandle(TsfnHandle&&) = delete;
    TsfnHandle& operator=(TsfnHandle&&) = delete;
    ~TsfnHandle() = default;

    // Queues `callback` to run on the event loop thread. Callable from any
    // thread; never blocks, never throws, and does nothing once the function is
    // gone -- there would be no loop left to run the callback on.
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
