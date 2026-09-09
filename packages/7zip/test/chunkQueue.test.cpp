// Standalone: c++ -std=c++20 -pthread -Ipackages/7zip/src
//   packages/7zip/test/chunkQueue.test.cpp packages/7zip/src/chunkQueue.cpp -o /tmp/7zip-queue-test
#include "chunkQueue.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <new>
#include <thread>

namespace {
thread_local bool failAllocation = false;
std::atomic<bool> pauseBufferAllocation{false};
std::atomic<bool> allocationEntered{false};
}  // namespace

void* operator new(std::size_t size) {
    if (failAllocation) {
        throw std::bad_alloc();
    }
    if (void* pointer = std::malloc(size == 0 ? 1 : size)) {
        return pointer;
    }
    throw std::bad_alloc();
}
void operator delete(void* pointer) noexcept { std::free(pointer); }
void operator delete(void* pointer, std::size_t) noexcept { std::free(pointer); }
void* operator new[](std::size_t size) {
    if (pauseBufferAllocation.load()) {
        allocationEntered.store(true);
        while (pauseBufferAllocation.load()) {
            std::this_thread::yield();
        }
    }
    return ::operator new(size);
}
void operator delete[](void* pointer) noexcept { std::free(pointer); }
void operator delete[](void* pointer, std::size_t) noexcept { std::free(pointer); }
void* operator new[](std::size_t size, const std::nothrow_t&) noexcept {
    try {
        return ::operator new[](size);
    } catch (...) {
        return nullptr;
    }
}
void operator delete[](void* pointer, const std::nothrow_t&) noexcept { std::free(pointer); }

int main() {
    using sevenzip::Chunk;
    using sevenzip::ChunkQueue;
    using Status = ChunkQueue::Status;
    const uint8_t bytes[] = {0, 1, 2, 3, 4, 5, 6, 7, 8};

    // Finish must publish its partial even when all subsequent allocations
    // fail and the ordinary queue slots are already full.
    {
        ChunkQueue queue(4, 2, []() {});
        assert(queue.Write(bytes, sizeof(bytes)));
        failAllocation = true;
        queue.Finish();
        size_t offset = 0;
        Chunk chunk;
        while (queue.TryTake(&chunk) == Status::kChunk) {
            for (size_t i = 0; i < chunk.length; ++i) {
                assert(chunk.data[i] == bytes[offset++]);
            }
        }
        assert(offset == sizeof(bytes));
        assert(!queue.OutOfMemory());
        failAllocation = false;
    }

    // A failed producer allocation still wakes a parked read and completes.
    {
        unsigned notifications = 0;
        ChunkQueue queue(4, 2, [&]() { ++notifications; });
        Chunk chunk;
        assert(queue.TryTake(&chunk) == Status::kPending);
        failAllocation = true;
        assert(!queue.Write(bytes, sizeof(bytes)));
        queue.Finish();
        assert(notifications == 1);
        assert(queue.OutOfMemory());
        assert(queue.TryTake(&chunk) == Status::kEnd);
        failAllocation = false;
    }

    // A producer paused INSIDE allocation must not hold the consumer lock.
    // Both read and cancellation must finish before allocation is resumed.
    {
        std::atomic<unsigned> notifications{0};
        ChunkQueue queue(4, 2, [&]() { notifications.fetch_add(1); });
        pauseBufferAllocation.store(true);
        std::thread producer([&]() {
            assert(!queue.Write(bytes, sizeof(bytes)));
            queue.Finish();
        });
        while (!allocationEntered.load()) {
            std::this_thread::yield();
        }
        Chunk chunk;
        assert(queue.TryTake(&chunk) == Status::kPending);
        queue.Abort();
        assert(queue.TryTake(&chunk) == Status::kEnd);
        pauseBufferAllocation.store(false);
        producer.join();
        assert(notifications.load() >= 1);
    }

    // Exercise repeated ring wraparound, bounded backpressure, and ordering.
    {
        ChunkQueue queue(3, 2, []() {});
        std::thread producer([&]() {
            for (unsigned i = 0; i < 20000; ++i) {
                assert(queue.Write(bytes, sizeof(bytes)));
            }
            queue.Finish();
        });
        size_t offset = 0;
        for (;;) {
            Chunk chunk;
            const auto status = queue.TryTake(&chunk);
            if (status == Status::kEnd) break;
            if (status == Status::kPending) {
                std::this_thread::yield();
                continue;
            }
            for (size_t i = 0; i < chunk.length; ++i) {
                assert(chunk.data[i] == bytes[offset++ % sizeof(bytes)]);
            }
        }
        producer.join();
        assert(offset == 20000 * sizeof(bytes));
    }
    std::cout << "queue allocation-failure, nonblocking, and wraparound tests passed\n";
}
