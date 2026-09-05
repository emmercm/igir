#include <algorithm>
#include <cstring>
#include <utility>

#include "chunkQueue.h"

namespace sevenzip {

ChunkQueue::ChunkQueue(size_t chunkBytes, size_t maxChunks)
    : chunkBytes_(std::max<size_t>(chunkBytes, 1)), maxChunks_(std::max<size_t>(maxChunks, 1)) {}

void ChunkQueue::SetOnReady(std::function<void()> onReady) {
    std::lock_guard<std::mutex> const lock(mutex_);
    onReady_ = std::move(onReady);
}

bool ChunkQueue::Write(const uint8_t* data, size_t length) {
    bool notify = false;
    {
        std::unique_lock<std::mutex> lock(mutex_);
        size_t written = 0;
        while (written < length) {
            if (aborted_) {
                return false;
            }
            if (!partial_.data) {
                // Default-initialized on purpose: only the bytes memcpy'd below
                // are ever reported, so pre-zeroing them would be work no one
                // reads. See the note on Chunk.
                partial_.data.reset(new uint8_t[chunkBytes_]);
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
            // One notification per Write() is enough however many chunks it
            // published: the consumer takes one, and its next TryTake() either
            // finds another waiting or arms the callback again.
            notify = std::exchange(waiting_, false) || notify;
        }
    }
    // Outside the lock: the callback ends up in N-API, and holding a mutex
    // across a foreign call is how deadlocks are built.
    if (notify && onReady_) {
        onReady_();
    }
    return true;
}

void ChunkQueue::Finish() {
    bool notify = false;
    {
        std::lock_guard<std::mutex> const lock(mutex_);
        if (partial_.length > 0) {
            ready_.push_back(std::move(partial_));
        }
        partial_ = {};
        finished_ = true;
        notify = std::exchange(waiting_, false);
    }
    notFull_.notify_all();
    if (notify && onReady_) {
        onReady_();
    }
}

void ChunkQueue::Abort() noexcept {
    try {
        bool notify = false;
        {
            std::lock_guard<std::mutex> const lock(mutex_);
            aborted_ = true;
            // Discard what is queued: a consumer that aborted mid-stream must
            // observe the end of the stream, not a few more chunks of data it
            // has already been told it will not get.
            ready_.clear();
            partial_ = {};
            notify = std::exchange(waiting_, false);
        }
        notFull_.notify_all();
        if (notify && onReady_) {
            onReady_();
        }
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
        std::lock_guard<std::mutex> const lock(mutex_);
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
