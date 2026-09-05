#include <algorithm>
#include <cstring>
#include <stdexcept>

#include "ringBuffer.h"

namespace sevenzip {

bool RingBuffer::Write(const uint8_t* data, size_t length) {
    std::unique_lock<std::mutex> lock(mutex_);
    size_t written = 0;
    while (written < length) {
        notFull_.wait(lock, [this]() { return aborted_ || count_ < buffer_.size(); });
        if (aborted_) {
            return false;
        }
        size_t const tail = (head_ + count_) % buffer_.size();
        size_t const contiguous = std::min(buffer_.size() - tail, buffer_.size() - count_);
        size_t const chunk = std::min(contiguous, length - written);
        std::memcpy(buffer_.data() + tail, data + written, chunk);
        count_ += chunk;
        written += chunk;
        notEmpty_.notify_one();
    }
    return true;
}

size_t RingBuffer::Read(uint8_t* out, size_t maxBytes) {
    if (maxBytes == 0) {
        // The loop below would copy nothing and return 0, which callers read as
        // end of stream while bytes are still queued. Throwing instead makes a
        // zero return value mean exactly one thing.
        throw std::invalid_argument("maxBytes must be at least 1");
    }
    std::unique_lock<std::mutex> lock(mutex_);
    notEmpty_.wait(lock, [this]() { return aborted_ || finished_ || count_ > 0; });
    if (aborted_ || count_ == 0) {
        // Aborted: whatever is still queued is discarded, so a consumer that
        // closed mid-read observes end of stream rather than a partial chunk.
        return 0;
    }
    size_t read = 0;
    while (read < maxBytes && count_ > 0) {
        size_t const contiguous = std::min(buffer_.size() - head_, count_);
        size_t const chunk = std::min(contiguous, maxBytes - read);
        std::memcpy(out + read, buffer_.data() + head_, chunk);
        head_ = (head_ + chunk) % buffer_.size();
        count_ -= chunk;
        read += chunk;
    }
    notFull_.notify_one();
    return read;
}

void RingBuffer::Finish() {
    {
        std::lock_guard<std::mutex> const lock(mutex_);
        finished_ = true;
    }
    notEmpty_.notify_all();
    notFull_.notify_all();
}

void RingBuffer::Abort() {
    {
        std::lock_guard<std::mutex> const lock(mutex_);
        aborted_ = true;
    }
    notEmpty_.notify_all();
    notFull_.notify_all();
}

}  // namespace sevenzip
