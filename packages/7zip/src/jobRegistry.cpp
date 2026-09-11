#include "jobRegistry.h"

#include <utility>

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
    Token previous = kInvalidToken;
    // Move one callback at a time without allocating a snapshot. Keep entries
    // registered until their workers exit; Unregister can run between moves.
    for (;;) {
        std::function<void()> cancel;
        {
            std::scoped_lock const lock(mutex_);
            // Refuse new jobs before moving the first cancellation callback.
            draining_ = true;
            const auto next = jobs_.upper_bound(previous);
            if (next == jobs_.end()) {
                break;
            }
            previous = next->first;
            cancel = std::move(next->second);
        }

        // Called with the lock dropped. Each cancel takes its job's own mutexes,
        // and jobs unregister through this registry's mutex as they exit, so
        // holding both at once would invert the lock order.
        //
        // A job that finished between moving the callback and here has dropped its
        // last shared_ptr, so the weak_ptr inside the callback fails to lock and the
        // call is a no-op.
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
