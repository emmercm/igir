#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <vector>

namespace sevenzip {

/**
 * Owns one completed region of decompressed output and its initialized length.
 *
 * Array storage avoids zero-filling bytes that the producer immediately
 * overwrites. Only the first `length` bytes are initialized and may be read.
 */
struct Chunk {
    std::unique_ptr<uint8_t[]> data;
    size_t length = 0;
};

/**
 * Connects one blocking decoder producer to one nonblocking event-loop consumer.
 *
 * Write blocks when the bounded queue is full, limiting memory to roughly
 * `chunkBytes * maxChunks`. TryTake never blocks; it arms `onReady` when empty.
 * Chunks are published full except for the final chunk before Finish.
 */
class ChunkQueue {
   public:
    /**
     * Preallocates the bounded ring and installs its immutable wakeup callback.
     *
     * Sizes are clamped to at least one, and `maxChunks` to at most 1024.
     * `onReady` fires without the lock, on the thread that makes a pending read
     * ready, and must not throw.
     */
    ChunkQueue(size_t chunkBytes, size_t maxChunks, std::function<void()> onReady);

    /** A queue owns synchronization primitives and cannot be copied. */
    ChunkQueue(const ChunkQueue&) = delete;
    /** A queue owns synchronization primitives and cannot be copy-assigned. */
    ChunkQueue& operator=(const ChunkQueue&) = delete;
    /** A queue owns synchronization primitives and cannot be moved. */
    ChunkQueue(ChunkQueue&&) = delete;
    /** A queue owns synchronization primitives and cannot be move-assigned. */
    ChunkQueue& operator=(ChunkQueue&&) = delete;
    /** Releases all buffered chunks after producer and consumer ownership has ended. */
    ~ChunkQueue() = default;

    /**
     * Copies producer bytes into fixed chunks, blocking for bounded backpressure.
     *
     * Returns false after cancellation or allocation failure. The noexcept
     * boundary matches 7-Zip's callback and translates every allocation or
     * library exception instead of allowing std::terminate.
     */
    bool Write(const uint8_t* data, size_t length) noexcept;

    /** Reports from any thread whether Write stopped because allocation failed; once set, it remains set. */
    [[nodiscard]] bool OutOfMemory() const noexcept;

    /** Publishes the producer's trailing partial chunk and marks successful completion. */
    void Finish();

    /** Stops and unblocks the producer and makes later reads report end-of-stream; safe from any thread. */
    void Abort() noexcept;

    /** Result of one nonblocking consumer attempt. */
    enum class Status {
        // `out` holds a chunk. Full, unless the producer has finished.
        kChunk,
        // Nothing is ready yet. The ready callback will fire once something is.
        kPending,
        // The producer is done, or the consumer aborted. Nothing more is coming.
        kEnd,
    };

    /** Moves one ready chunk into `out`, or arms notification and returns immediately. */
    Status TryTake(Chunk* out);

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

    /** Records terminal allocation failure without the lock held, releases backpressure, and wakes the consumer. */
    void MarkOutOfMemory() noexcept;

    const size_t chunkBytes_;
    const size_t maxChunks_;

    std::mutex mutex_;
    std::condition_variable notFull_;
    // Allocated at construction. Publishing/taking a chunk only moves a
    // pointer; neither operation grows/frees a container under the lock.
    std::vector<Chunk> ready_;
    size_t head_ = 0;
    size_t count_ = 0;
    // Producer-only, including during Abort. Not visible to the consumer until full, or
    // until Finish() publishes what there is of it. It is deliberately outside
    // the maxChunks_ bound: one extra chunk of slack, not a queue slot.
    Chunk partial_;
    bool finished_ = false;
    std::atomic<bool> aborted_{false};
    // Set by a Write() that could not allocate. It rides alongside aborted_
    // rather than replacing it (the producer stops either way) so that the
    // consumer can report a failure instead of a stream that silently ends
    // early. Atomic so the consumer can read it without ordering itself against
    // a producer parked inside this queue.
    std::atomic<bool> outOfMemory_{false};
    // Set by a TryTake() that returned kPending, cleared by whoever fires the
    // callback. Guarded by mutex_ so that the check-and-arm on the consumer side
    // cannot interleave with the publish-and-fire on the producer side.
    bool waiting_ = false;
    // Immutable after construction, which is what makes it safe to call with
    // the lock dropped from either thread
    const std::function<void()> onReady_;
};

}  // namespace sevenzip
