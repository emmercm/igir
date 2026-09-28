#include "outputSlot.h"

#include <algorithm>
#include <cstring>
#include <utility>

namespace sevenzip {

OutputSlot::OutputSlot(std::function<void()> onReady) : onReady_(std::move(onReady)) {}

void OutputSlot::FlushReady(std::unique_lock<std::mutex>& lock) {
    if (!onReady_ || !waiting_) {
        return;
    }
    // Cleared before the call, not after, so the callback fires once for the
    // kPending that armed it. A consumer that still cannot make progress
    // re-arms it from its next TryTake().
    waiting_ = false;
    lock.unlock();
    onReady_();
    lock.lock();
}

bool OutputSlot::Failed() const noexcept { return failed_.load(std::memory_order_relaxed); }

void OutputSlot::Lend(uint8_t* data, size_t capacity) {
    {
        std::scoped_lock const lock(mutex_);
        data_ = data;
        capacity_ = capacity;
        length_ = 0;
    }
    lent_.notify_one();
}

bool OutputSlot::Write(const uint8_t* data, size_t length) noexcept {
    try {
        return WriteOrThrow(data, length);
    } catch (...) {
        // Only the mutex and condition variable can throw here. Stop the
        // producer, as Abort() does, but flag it so the consumer reports a
        // failure rather than an entry that quietly stopped early.
        failed_.store(true, std::memory_order_relaxed);
        Abort();
        return false;
    }
}

bool OutputSlot::WriteOrThrow(const uint8_t* data, size_t length) {
    size_t written = 0;
    std::unique_lock<std::mutex> lock(mutex_);
    while (written < length) {
        lent_.wait(lock, [this]() { return aborted_ || (data_ != nullptr && length_ < capacity_); });
        if (aborted_) {
            return false;
        }
        // Copied under the lock, so that Abort(), which takes it too, cannot
        // return while the lent memory is still being written
        size_t const take = std::min(capacity_ - length_, length - written);
        std::memcpy(data_ + length_, data + written, take);
        length_ += take;
        written += take;

        if (length_ == capacity_) {
            // Notify before the loop can reach the wait above again. Only the
            // consumer can lend the next buffer, so holding its notification
            // back until Write() returns deadlocks the two the moment one call
            // fills a buffer with bytes still left over: the producer waits for
            // a buffer only the consumer can lend, and the consumer waits for
            // the callback the producer is still holding. One call really can
            // fill several, since decoders emit up to a megabyte at a time.
            //
            // FlushReady() drops the lock, so the wait above re-checks aborted_.
            FlushReady(lock);
        }
    }
    return true;
}

void OutputSlot::Finish() {
    std::unique_lock<std::mutex> lock(mutex_);
    finished_ = true;
    FlushReady(lock);
}

void OutputSlot::Abort() noexcept {
    try {
        std::unique_lock<std::mutex> lock(mutex_);
        aborted_ = true;
        // Forgotten here, while holding the lock the producer copies under, so
        // the caller may free the memory as soon as this returns
        data_ = nullptr;
        capacity_ = 0;
        length_ = 0;
        lent_.notify_all();
        FlushReady(lock);
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Locking can in principle fail, and this is reached from destructors
        // and other paths that must not throw. There is nowhere to report it.
    }
}

OutputSlot::Status OutputSlot::TryTake(size_t* length) {
    const std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock);
    if (!lock.owns_lock()) {
        // The producer is copying into the lent buffer. Retry on a future loop
        // turn instead of waiting for it; the signal coalesces repeated
        // notifications.
        if (onReady_) {
            onReady_();
        }
        return Status::kPending;
    }
    if (!aborted_ && data_ != nullptr && (length_ == capacity_ || (finished_ && length_ > 0))) {
        *length = length_;
        data_ = nullptr;
        capacity_ = 0;
        length_ = 0;
        return Status::kChunk;
    }
    if (aborted_ || finished_) {
        // Finish() leaves a partial buffer in place before setting finished_,
        // so an empty one here really is the end
        data_ = nullptr;
        capacity_ = 0;
        length_ = 0;
        return Status::kEnd;
    }
    waiting_ = true;
    return Status::kPending;
}

}  // namespace sevenzip
