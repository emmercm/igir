#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>

namespace sevenzip {

/**
 * Connects one blocking decoder producer to one nonblocking event-loop consumer through a single lent buffer.
 *
 * The consumer lends one buffer per read, and the producer copies decoder
 * output into it, blocking while no buffer is lent. So the decoder runs at most
 * one buffer ahead of the reader, and any further read-ahead is the stream's
 * own. Buffers are handed back full, except for the final one before Finish.
 * The slot never allocates or frees the memory it is lent.
 */
class OutputSlot {
   public:
    /**
     * Installs the immutable wakeup callback.
     *
     * `onReady` fires without the lock, on the thread that makes a pending read
     * ready, and must not throw.
     */
    explicit OutputSlot(std::function<void()> onReady);

    /** A slot owns synchronization primitives and cannot be copied. */
    OutputSlot(const OutputSlot&) = delete;
    /** A slot owns synchronization primitives and cannot be copy-assigned. */
    OutputSlot& operator=(const OutputSlot&) = delete;
    /** A slot owns synchronization primitives and cannot be moved. */
    OutputSlot(OutputSlot&&) = delete;
    /** A slot owns synchronization primitives and cannot be move-assigned. */
    OutputSlot& operator=(OutputSlot&&) = delete;
    /** Forgets any lent buffer without touching it. */
    ~OutputSlot() = default;

    /**
     * Lends `capacity` bytes at `data` for the producer to fill, and wakes it.
     *
     * Consumer only, and only while nothing is lent. The memory must stay valid
     * until TryTake returns kChunk or kEnd, or until Abort returns.
     */
    void Lend(uint8_t* data, size_t capacity);

    /**
     * Copies producer bytes into lent buffers, blocking while none is lent.
     *
     * Returns false after cancellation, or if waiting itself failed. The
     * noexcept boundary matches 7-Zip's callback, which must not throw.
     */
    bool Write(const uint8_t* data, size_t length) noexcept;

    /** Reports from any thread whether Write stopped because waiting failed; once set, it remains set. */
    [[nodiscard]] bool Failed() const noexcept;

    /** Hands back the lent buffer's partial contents, if any, and marks successful completion. */
    void Finish();

    /**
     * Stops and unblocks the producer and makes later reads report end-of-stream; safe from any thread.
     *
     * Once it returns, the producer will not touch the lent buffer again, so
     * its memory may be freed.
     */
    void Abort() noexcept;

    /** Result of one nonblocking consumer attempt. */
    enum class Status {
        // The lent buffer is handed back holding `*length` bytes. Full, unless
        // the producer has finished.
        kChunk,
        // Nothing is ready yet. The ready callback will fire once something is.
        kPending,
        // The producer is done, or the consumer aborted. Nothing more is coming,
        // and the lent buffer, if any, is handed back unused.
        kEnd,
    };

    /** Takes back the lent buffer if it is ready, or arms notification and returns immediately. */
    Status TryTake(size_t* length);

   private:
    /**
     * Fires an armed wakeup with the mutex released, then reacquires it.
     *
     * Avoiding a foreign callback under the mutex prevents deadlock. Callers
     * must recheck cached state after return.
     */
    void FlushReady(std::unique_lock<std::mutex>& lock);

    /** Implements producer writes with ordinary throwing operations for Write's noexcept wrapper. */
    bool WriteOrThrow(const uint8_t* data, size_t length);

    std::mutex mutex_;
    std::condition_variable lent_;
    // The buffer the consumer has lent, or null. The producer copies into it
    // only while holding mutex_, which is what lets Abort() promise that it is
    // no longer being written once it returns.
    uint8_t* data_ = nullptr;
    size_t capacity_ = 0;
    size_t length_ = 0;
    bool finished_ = false;
    bool aborted_ = false;
    // Set by a Write() that could not wait for a buffer. It rides alongside
    // aborted_ so that the consumer can report a failure instead of a stream
    // that silently ends early.
    std::atomic<bool> failed_{false};
    // Set by a TryTake() that returned kPending, cleared by whoever fires the
    // callback. Guarded by mutex_ so that the check-and-arm on the consumer side
    // cannot interleave with the publish-and-fire on the producer side.
    bool waiting_ = false;
    // Immutable after construction, which is what makes it safe to call with
    // the lock dropped from either thread
    const std::function<void()> onReady_;
};

}  // namespace sevenzip
