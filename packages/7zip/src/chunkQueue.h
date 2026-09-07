#pragma once

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
// The storage is allocated with `new uint8_t[n]` rather than a std::vector so
// that it is default-initialized: the producer overwrites every byte it later
// reports, and zero-filling a megabyte per read only to memcpy over it is pure
// waste. `length` is the only part that has been written, and it is the only
// part any consumer is ever shown -- the bytes past it are uninitialized and
// must not be read.
struct Chunk {
    std::unique_ptr<uint8_t[]> data;
    size_t length = 0;
};

// A bounded queue of completed chunks with one producer and one consumer.
//
// This exists to bridge a pushing producer to a pulling consumer that must
// never block. 7-Zip's Extract() pushes bytes at whatever size its decoder
// happens to emit; a JavaScript stream pulls a fixed amount at a time, on the
// event loop thread, where blocking would stall every other pending callback in
// the process. So the asymmetry is deliberate and the two sides are not
// symmetric operations:
//
//   - Write() BLOCKS while the queue is full. That is the whole back-pressure
//     mechanism: it bounds memory to roughly `chunkBytes * maxChunks`, and the
//     producer is a thread of ours whose only job is to wait on the consumer.
//   - TryTake() NEVER blocks. When nothing is ready it says so and arms the
//     ready callback, so the consumer can go away and be told later.
//
// Chunks are handed out whole and full: the producer accumulates into a partial
// chunk and only publishes it at exactly `chunkBytes`, so a consumer asking for
// a high-watermark's worth of bytes gets exactly that, however small the writes
// the decoder happens to make. Only the final chunk before Finish() is short.
//
// Nothing here knows about 7-Zip or N-API: this is a plain data structure, kept
// in its own translation unit so it can be reasoned about on its own.
class ChunkQueue {
   public:
    // `chunkBytes` is the size of every published chunk but the last, and
    // `maxChunks` how many may sit queued before Write() blocks. Both must be at
    // least 1.
    //
    // `onReady` is fired -- on whichever thread published the chunk, with the
    // lock dropped -- when a TryTake() that returned kPending could now make
    // progress. It is taken here rather than through a setter so that it is
    // immutable for the object's lifetime: every producer path reads it outside
    // the lock, which is only sound because nothing can ever reassign it. It
    // must not throw, and is called exactly once per kPending.
    ChunkQueue(size_t chunkBytes, size_t maxChunks, std::function<void()> onReady);

    ChunkQueue(const ChunkQueue&) = delete;
    ChunkQueue& operator=(const ChunkQueue&) = delete;
    ChunkQueue(ChunkQueue&&) = delete;
    ChunkQueue& operator=(ChunkQueue&&) = delete;
    ~ChunkQueue() = default;

    // Producer. Blocks while the queue is full. Returns false once Abort() has
    // been called, after which nothing further should be written.
    bool Write(const uint8_t* data, size_t length);

    // Producer. Publishes any partial chunk and marks the end of the stream.
    void Finish();

    // Consumer. Unblocks the producer, discards what is queued, and makes every
    // later TryTake() report kEnd. Safe to call at any time, from any thread.
    void Abort() noexcept;

    enum class Status {
        // `out` holds a chunk. Full, unless the producer has finished.
        kChunk,
        // Nothing is ready yet. The ready callback will fire once something is;
        // it fires exactly once per kPending.
        kPending,
        // The producer is done, or the consumer aborted. Nothing more is coming.
        kEnd,
    };

    // Consumer, and the reason this class exists: it never blocks.
    Status TryTake(Chunk* out);

   private:
    // Fires `onReady_` if a TryTake() armed it, dropping `lock` for the call --
    // the callback ends up in N-API, and holding a mutex across a foreign call
    // is how deadlocks are built -- and re-acquiring it before returning. The
    // caller must therefore re-check any state it cached across the call.
    //
    // Every path that publishes a chunk, or that stops publishing for good,
    // calls this BEFORE it can block or return. That ordering is the whole
    // reason the class does not deadlock: see the note in Write().
    void FlushReady(std::unique_lock<std::mutex>& lock);

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
    // Set by a TryTake() that returned kPending, cleared by whoever fires the
    // callback. Guarded by mutex_ so that the check-and-arm on the consumer side
    // cannot interleave with the publish-and-fire on the producer side.
    bool waiting_ = false;
    // Immutable after construction, which is what makes it safe to call with
    // the lock dropped from either thread.
    const std::function<void()> onReady_;
};

}  // namespace sevenzip
