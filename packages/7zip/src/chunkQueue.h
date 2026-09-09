#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>

namespace sevenzip {

// One completed unit of decompressed output, owning its storage.
//
// The storage is `new uint8_t[n]` rather than a std::vector so that it is
// default-initialized: the producer overwrites every byte it reports, and
// zero-filling a megabyte only to memcpy over it is waste. Only the first
// `length` bytes are written; the rest are uninitialized and must not be read.
struct Chunk {
    std::unique_ptr<uint8_t[]> data;
    size_t length = 0;
};

// A bounded queue of completed chunks with one producer and one consumer.
//
// The producer pushes bytes at whatever size it happens to produce them; the
// consumer must never block. So the two sides are deliberately asymmetric:
//
//   - Write() BLOCKS while the queue is full. That is the back-pressure
//     mechanism: it bounds memory to roughly `chunkBytes * maxChunks`.
//   - TryTake() NEVER blocks. When nothing is ready it says so and arms the
//     ready callback, so the consumer can go away and be told later.
//
// Chunks are published whole and full, however small the writes into them were.
// Only the final chunk before Finish() is short.
class ChunkQueue {
   public:
    // `chunkBytes` is the size of every published chunk but the last, and
    // `maxChunks` how many may sit queued before Write() blocks. Both are
    // clamped to at least 1.
    //
    // `onReady` fires exactly once for each TryTake() that returned kPending,
    // on whichever thread published the chunk, with the lock dropped. It must
    // not throw. Taking it here rather than through a setter keeps it immutable
    // for the object's lifetime, which is what makes it safe to call from
    // either thread outside the lock.
    ChunkQueue(size_t chunkBytes, size_t maxChunks, std::function<void()> onReady);

    ChunkQueue(const ChunkQueue&) = delete;
    ChunkQueue& operator=(const ChunkQueue&) = delete;
    ChunkQueue(ChunkQueue&&) = delete;
    ChunkQueue& operator=(ChunkQueue&&) = delete;
    ~ChunkQueue() = default;

    // Producer. Blocks while the queue is full. Returns false once Abort() has
    // been called, or once an allocation has failed, after which nothing
    // further should be written; OutOfMemory() tells the two apart.
    //
    // noexcept is load-bearing. The only caller is 7-Zip's
    // ISequentialOutStream::Write, whose signature carries upstream's `throw()`
    // -- a synonym for noexcept under C++17 -- so an escaping std::bad_alloc
    // would call std::terminate(). Every allocating step in here is therefore
    // nothrow or caught, and running out of memory becomes a rejected read.
    bool Write(const uint8_t* data, size_t length) noexcept;

    // Whether Write() stopped because an allocation failed rather than because
    // the consumer aborted. Set once and never cleared. Safe from any thread.
    [[nodiscard]] bool OutOfMemory() const noexcept;

    // Producer. Publishes any partial chunk and marks the end of the stream.
    void Finish();

    // Consumer. Unblocks the producer, discards what is queued, and makes every
    // later TryTake() report kEnd. Safe to call at any time, from any thread.
    void Abort() noexcept;

    enum class Status {
        // `out` holds a chunk. Full, unless the producer has finished.
        kChunk,
        // Nothing is ready yet. The ready callback will fire once something is.
        kPending,
        // The producer is done, or the consumer aborted. Nothing more is coming.
        kEnd,
    };

    // Consumer, and the reason this class exists: it never blocks.
    Status TryTake(Chunk* out);

   private:
    // Fires `onReady_` if a TryTake() armed it, dropping `lock` for the call --
    // the callback ends up in N-API, and holding a mutex across a foreign call
    // invites deadlock -- and re-acquiring it before returning. Callers must
    // re-check any state they cached across the call.
    //
    // Every path that publishes a chunk, or stops publishing for good, calls
    // this before it can block or return, which is what keeps the producer and
    // a parked consumer from waiting on each other.
    void FlushReady(std::unique_lock<std::mutex>& lock);

    // The body of Write(), which is allowed to throw so that the ordinary
    // allocating operations in it can be written normally. Write() is the
    // noexcept wrapper that turns anything escaping this into OutOfMemory().
    bool WriteOrThrow(const uint8_t* data, size_t length);

    // Records that the producer ran out of memory and stops it, waking a
    // consumer that is parked on the ready callback. Called with the lock NOT
    // held.
    void MarkOutOfMemory() noexcept;

    const size_t chunkBytes_;
    const size_t maxChunks_;

    std::mutex mutex_;
    std::condition_variable notFull_;
    std::deque<Chunk> ready_;
    // The chunk being filled. Not visible to the consumer until it is full, or
    // until Finish() publishes what there is of it. It is deliberately outside
    // the maxChunks_ bound -- one extra chunk of slack, not a queue slot.
    Chunk partial_;
    bool finished_ = false;
    bool aborted_ = false;
    // Set by a Write() that could not allocate. It rides alongside aborted_
    // rather than replacing it -- the producer stops either way -- so that the
    // consumer can report a failure instead of a stream that silently ends
    // early. Atomic so the consumer can read it without ordering itself against
    // a producer parked inside this queue.
    std::atomic<bool> outOfMemory_{false};
    // Set by a TryTake() that returned kPending, cleared by whoever fires the
    // callback. Guarded by mutex_ so that the check-and-arm on the consumer side
    // cannot interleave with the publish-and-fire on the producer side.
    bool waiting_ = false;
    // Immutable after construction, which is what makes it safe to call with
    // the lock dropped from either thread.
    const std::function<void()> onReady_;
};

}  // namespace sevenzip
