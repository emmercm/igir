#pragma once

#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>

namespace sevenzip {

// The set of detached worker threads that are currently running, so that the
// addon has something to cancel and something to wait on when its JavaScript
// environment is torn down.
//
// Every long-running thread in this addon is detached, never joined, so that no
// JavaScript caller waits for a decoder to notice it should stop. That leaves
// one case unhandled: Node tearing the environment down while a decoder is still
// mid-archive, after which the thread runs on against a freed env. At teardown
// every live job is cancelled and waited for, which closes that window.
//
// Nothing here includes <napi.h>, so a job can register without depending on
// N-API.
class JobRegistry {
   public:
    using Token = uint64_t;

    // Never returned by a successful Register(); tokens start at 1
    static constexpr Token kInvalidToken = 0;

    JobRegistry() = default;
    ~JobRegistry() = default;
    JobRegistry(const JobRegistry&) = delete;
    JobRegistry& operator=(const JobRegistry&) = delete;
    JobRegistry(JobRegistry&&) = delete;
    JobRegistry& operator=(JobRegistry&&) = delete;

    // Records a running job and returns the token used to remove it again.
    //
    // Returns kInvalidToken when the registry is already draining, which means
    // teardown has begun and the caller must NOT start its thread: nothing
    // would be left to wait for it. Callers treat that as a failure to start.
    //
    // `cancel` may be invoked from the teardown thread at any point until the
    // matching Unregister() returns, so it must capture weakly (a
    // std::weak_ptr locked inside the callback) rather than hold a raw
    // pointer to an object that could be destroyed in between. It must not
    // throw, and must only ask the job to stop: DrainAndWait() does the
    // waiting.
    Token Register(std::function<void()> cancel);

    // Removes a job. Must be the very last thing its thread does: once this
    // returns, teardown is free to conclude that the thread is finished, and
    // anything the thread touches afterwards may already have been freed.
    void Unregister(Token token) noexcept;

    // Cancels every live job and blocks until all of them have unregistered.
    // After the first call the registry stays drained, so no later job can
    // start and be missed.
    //
    // The wait is deliberately unbounded: a timeout here would trade a hang
    // that can be diagnosed from a stack trace for a use-after-free that
    // cannot.
    void DrainAndWait() noexcept;

   private:
    mutable std::mutex mutex_;
    std::condition_variable empty_;
    std::map<Token, std::function<void()>> jobs_;
    Token nextToken_ = 1;
    bool draining_ = false;
};

}  // namespace sevenzip
