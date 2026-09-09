#include "jobRegistry.h"

#include <utility>
#include <vector>

namespace sevenzip {

JobRegistry::Token JobRegistry::Register(std::function<void()> cancel) {
    std::scoped_lock const lock(mutex_);
    if (draining_) {
        return kInvalidToken;
    }
    Token const token = nextToken_++;
    jobs_.emplace(token, std::move(cancel));
    return token;
}

void JobRegistry::Unregister(Token token) noexcept {
    if (token == kInvalidToken) {
        return;
    }
    // The erased std::function is destroyed inside the lock, which is safe
    // because it only ever captures a weak_ptr and an integer, nothing whose
    // destructor could reach back into this registry
    {
        std::scoped_lock const lock(mutex_);
        jobs_.erase(token);
        if (!jobs_.empty() || !draining_) {
            return;
        }
    }
    // Only the last job out during a drain has to wake the waiter, and it does
    // so with the lock already dropped so that DrainAndWait() is not woken onto
    // a mutex this thread still holds
    empty_.notify_all();
}

void JobRegistry::DrainAndWait() noexcept {
    std::vector<std::function<void()>> cancels;
    {
        std::scoped_lock const lock(mutex_);
        // Set before the snapshot is taken, which is what makes the snapshot
        // complete: from here on Register() refuses, so no job can slip in
        // between copying the list and waiting on it
        draining_ = true;
        try {
            cancels.reserve(jobs_.size());
            for (const auto& entry : jobs_) {
                cancels.push_back(entry.second);
            }
        } catch (...) {
            // Copying the callbacks allocates, and this runs from a teardown
            // hook. Failing here costs the early cancel, not the wait below,
            // so the jobs run to completion instead of being cut short.
            cancels.clear();
        }
    }

    // Called with the lock dropped. Each cancel takes its job's own mutexes,
    // and jobs unregister through this registry's mutex as they exit, so
    // holding both at once would invert the lock order.
    //
    // A job that finished between the snapshot and here has already dropped its
    // last shared_ptr, so the weak_ptr inside the callback fails to lock and the
    // call is a no-op.
    for (const std::function<void()>& cancel : cancels) {
        if (!cancel) {
            continue;
        }
        try {
            cancel();
        } catch (...) {  // NOLINT(bugprone-empty-catch)
            // Documented as non-throwing, and teardown is already underway
            // with no environment left to throw into. One job refusing to stop
            // must not prevent the rest from being asked.
        }
    }

    try {
        std::unique_lock<std::mutex> lock(mutex_);
        empty_.wait(lock, [this]() { return jobs_.empty(); });
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // These throw only when the underlying OS primitive fails, which a
        // teardown hook cannot recover from, and letting it escape a noexcept
        // function calls std::terminate()
    }
}

}  // namespace sevenzip
