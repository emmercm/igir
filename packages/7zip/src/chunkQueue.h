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
    ChunkQueue(size_t chunkBytes, size_t maxChunks);

    ChunkQueue(const ChunkQueue&) = delete;
    ChunkQueue& operator=(const ChunkQueue&) = delete;
    ChunkQueue(ChunkQueue&&) = delete;
    ChunkQueue& operator=(ChunkQueue&&) = delete;
    ~ChunkQueue() = default;

    // Installs the callback fired -- on the producer's thread, outside the lock
    // -- when a TryTake() that returned kPending could now make progress. Must
    // be set before the producer starts, and is never called again after the
    // one kPending it answers.
    void SetOnReady(std::function<void()> onReady);

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
    std::function<void()> onReady_;
};

}  // namespace sevenzip
