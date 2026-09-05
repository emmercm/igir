#pragma once

#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <vector>

namespace sevenzip {

// A fixed-capacity byte queue with one producer and one consumer. Capacity never
// grows, so a slow consumer applies back-pressure to the producer instead of
// letting it buffer an entire entry in memory.
//
// Nothing here knows about 7-Zip or N-API: this is a plain data structure, kept
// in its own translation unit so it can be reasoned about -- and tested --
// without an archive in hand.
class RingBuffer {
   public:
    explicit RingBuffer(size_t capacity) : buffer_(capacity) {}

    RingBuffer(const RingBuffer&) = delete;
    RingBuffer& operator=(const RingBuffer&) = delete;
    RingBuffer(RingBuffer&&) = delete;
    RingBuffer& operator=(RingBuffer&&) = delete;
    ~RingBuffer() = default;

    // Blocks until every byte is queued. Returns false if Abort() was called,
    // in which case nothing further should be written.
    bool Write(const uint8_t* data, size_t length);

    // Blocks until bytes are available, the producer finishes, or Abort() is
    // called. Returns the number of bytes copied; 0 means end of stream, and is
    // returned only once Finish() or Abort() has been called -- a short or empty
    // result never stands in for EOF. `maxBytes` must be at least 1;
    // std::invalid_argument is thrown otherwise, because a zero-length copy has
    // no answer that is distinguishable from end of stream.
    size_t Read(uint8_t* out, size_t maxBytes);

    // The producer has written its last byte.
    void Finish();

    // Unblock both sides and refuse further writes.
    void Abort();

   private:
    mutable std::mutex mutex_;
    std::condition_variable notFull_;
    std::condition_variable notEmpty_;
    std::vector<uint8_t> buffer_;
    size_t head_ = 0;   // next byte to read
    size_t count_ = 0;  // bytes currently queued
    bool finished_ = false;
    bool aborted_ = false;
};

}  // namespace sevenzip
