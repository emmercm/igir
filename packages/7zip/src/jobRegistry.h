#pragma once

#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>

namespace sevenzip {

/**
 * Tracks detached workers so environment teardown can cancel and drain them safely.
 *
 * Ordinary JavaScript paths never join workers, but teardown must wait to keep
 * them from accessing a freed environment. This registry deliberately has no
 * N-API dependency.
 */
class JobRegistry {
   public:
    using Token = uint64_t;

    // Never returned by a successful Register(); tokens start at 1
    static constexpr Token kInvalidToken = 0;

    /** Creates an accepting registry with no live jobs. */
    JobRegistry() = default;
    /** Destroys a registry only after its owner has drained all registered jobs. */
    ~JobRegistry() = default;
    /** Registry identity and synchronization state cannot be copied. */
    JobRegistry(const JobRegistry&) = delete;
    /** Registry identity and synchronization state cannot be copy-assigned. */
    JobRegistry& operator=(const JobRegistry&) = delete;
    /** Registry identity and synchronization state cannot be moved. */
    JobRegistry(JobRegistry&&) = delete;
    /** Registry identity and synchronization state cannot be move-assigned. */
    JobRegistry& operator=(JobRegistry&&) = delete;

    /**
     * Registers a cancellation callback before its worker starts and returns its token.
     *
     * Returns kInvalidToken once draining begins, when the caller must not
     * start. The callback can run concurrently until Unregister returns, so it
     * must capture weakly, only request cancellation, and never throw.
     */
    Token Register(std::function<void()> cancel);

    /** Removes a finished worker and wakes teardown if it was last; this must be the worker's final action. */
    void Unregister(Token token) noexcept;

    /**
     * Permanently refuses new jobs, cancels every live job, and waits for all to unregister.
     * The wait is deliberately unbounded because timing out would permit a use-after-free.
     */
    void DrainAndWait() noexcept;

   private:
    mutable std::mutex mutex_;
    std::condition_variable empty_;
    std::map<Token, std::function<void()>> jobs_;
    Token nextToken_ = 1;
    bool draining_ = false;
};

}  // namespace sevenzip
