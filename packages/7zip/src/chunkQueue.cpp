#include "chunkQueue.h"

#include <algorithm>
#include <cstring>
#include <new>
#include <utility>

namespace sevenzip {

ChunkQueue::ChunkQueue(size_t chunkBytes, size_t maxChunks, std::function<void()> onReady)
    : chunkBytes_(std::max<size_t>(chunkBytes, 1)),
      maxChunks_(std::max<size_t>(maxChunks, 1)),
      onReady_(std::move(onReady)) {}

void ChunkQueue::FlushReady(std::unique_lock<std::mutex>& lock) {
    if (!onReady_ || !waiting_) {
        return;
    }
    // Cleared before the call, not after: this is the "exactly once per
    // kPending" half of the contract, and the consumer re-arms it from its next
    // TryTake() if it still cannot make progress.
    waiting_ = false;
    lock.unlock();
    onReady_();
    lock.lock();
}

bool ChunkQueue::OutOfMemory() const noexcept { return outOfMemory_.load(std::memory_order_relaxed); }

void ChunkQueue::MarkOutOfMemory() noexcept {
    outOfMemory_.store(true, std::memory_order_relaxed);
    try {
        std::unique_lock<std::mutex> lock(mutex_);
        // Stopping the producer is the same thing Abort() does, and for the
        // same reason: nothing more can be published. What is already queued is
        // deliberately NOT discarded -- the bytes that were decoded before the
        // allocation failed are still good, and this is the same contract a
        // mid-entry extraction failure follows.
        aborted_ = true;
        notFull_.notify_all();
        FlushReady(lock);
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Same reasoning as Abort(): this is reached from a noexcept boundary
        // and there is nowhere left to report a failure to lock or to notify.
        // The flag above is already set, which is the part the consumer needs.
    }
}

bool ChunkQueue::Write(const uint8_t* data, size_t length) noexcept {
    try {
        return WriteOrThrow(data, length);
    } catch (...) {
        // Reached when publishing a chunk allocates and cannot: the deque node
        // in ready_, the ThreadSafeFunction call FlushReady() ends up making,
        // or the condition variable's own wait. The chunk buffer itself is
        // allocated nothrow below and reports through the same path, so all of
        // them arrive here.
        MarkOutOfMemory();
        return false;
    }
}

bool ChunkQueue::WriteOrThrow(const uint8_t* data, size_t length) {
    std::unique_lock<std::mutex> lock(mutex_);
    size_t written = 0;
    while (written < length) {
        if (aborted_) {
            return false;
        }
        if (!partial_.data) {
            // Default-initialized on purpose: only the bytes memcpy'd below
            // are ever reported, so pre-zeroing them would be work no one
            // reads.
            //
            // Nothrow because this is by far the largest allocation the addon
            // makes, so on a 32-bit build it is the one most likely to fail --
            // and Write() must not let a std::bad_alloc escape.
            partial_.data.reset(new (std::nothrow) uint8_t[chunkBytes_]);
            if (!partial_.data) {
                lock.unlock();
                MarkOutOfMemory();
                return false;
            }
            partial_.length = 0;
        }
        size_t const room = chunkBytes_ - partial_.length;
        size_t const take = std::min(room, length - written);
        std::memcpy(partial_.data.get() + partial_.length, data + written, take);
        partial_.length += take;
        written += take;

        if (partial_.length < chunkBytes_) {
            continue;  // held back until it is full, so reads are never short
        }
        notFull_.wait(lock, [this]() { return aborted_ || ready_.size() < maxChunks_; });
        if (aborted_) {
            return false;
        }
        ready_.push_back(std::move(partial_));
        partial_ = {};
        // Immediately, and before this loop can reach the wait above again. A
        // parked consumer is the ONLY thing that can drain this queue, so
        // holding its notification back until Write() returns deadlocks the two
        // against each other the moment one call publishes maxChunks_ chunks:
        // the producer waits for room that only the consumer can make, and the
        // consumer waits for the callback the producer is still holding. A
        // single call really can carry that many chunks: decoders emit up to a
        // megabyte at a time, which is about what this queue holds in total.
        //
        // FlushReady() drops the lock, so nothing cached across it survives:
        // the loop re-checks aborted_ from the top.
        FlushReady(lock);
    }
    return true;
}

void ChunkQueue::Finish() {
    std::unique_lock<std::mutex> lock(mutex_);
    if (partial_.length > 0) {
        ready_.push_back(std::move(partial_));
    }
    partial_ = {};
    finished_ = true;
    notFull_.notify_all();
    FlushReady(lock);
}

void ChunkQueue::Abort() noexcept {
    try {
        std::unique_lock<std::mutex> lock(mutex_);
        aborted_ = true;
        // Discard what is queued: a consumer that aborted mid-stream must
        // observe the end of the stream, not a few more chunks of data it
        // has already been told it will not get.
        ready_.clear();
        partial_ = {};
        notFull_.notify_all();
        FlushReady(lock);
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Locking a mutex can in principle fail, and this is reached from
        // destructors and other paths that must not throw. There is nowhere to
        // report it, and the producer's next Write() will find the queue in
        // whatever state it is in.
    }
}

ChunkQueue::Status ChunkQueue::TryTake(Chunk* out) {
    bool notifyProducer = false;
    Status status = Status::kEnd;
    {
        std::scoped_lock const lock(mutex_);
        if (!ready_.empty()) {
            *out = std::move(ready_.front());
            ready_.pop_front();
            notifyProducer = true;
            status = Status::kChunk;
        } else if (aborted_ || finished_) {
            // Finish() published the trailing partial chunk before setting
            // finished_, so an empty queue here really is the end.
            status = Status::kEnd;
        } else {
            waiting_ = true;
            status = Status::kPending;
        }
    }
    if (notifyProducer) {
        notFull_.notify_one();
    }
    return status;
}

}  // namespace sevenzip
