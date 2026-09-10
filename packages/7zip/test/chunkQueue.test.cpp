// Standalone: c++ -std=c++20 -pthread -Ipackages/7zip/src
//   packages/7zip/test/chunkQueue.test.cpp packages/7zip/src/chunkQueue.cpp -o /tmp/7zip-queue-test
#include "../src/chunkQueue.h"

#include <array>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <new>
#include <thread>

namespace {
// NOLINTBEGIN(cppcoreguidelines-avoid-non-const-global-variables)
thread_local bool failAllocation = false;
std::atomic<bool> pauseBufferAllocation{false};
std::atomic<bool> allocationEntered{false};
// NOLINTEND(cppcoreguidelines-avoid-non-const-global-variables)
}  // namespace

// These allocation overrides provide deterministic failure and pause injection
// for the standalone concurrency test.
// NOLINTBEGIN(cppcoreguidelines-init-variables,cppcoreguidelines-no-malloc,misc-unused-parameters,readability-inconsistent-declaration-parameter-name,readability-named-parameter)
/** Allocates storage while honoring the test's scalar-allocation failure switch. */
void* operator new(std::size_t size) {
    if (failAllocation) {
        throw std::bad_alloc();
    }
    void* pointer = std::malloc(size == 0 ? 1 : size);
    if (pointer != nullptr) {
        return pointer;
    }
    throw std::bad_alloc();
}
/** Releases storage allocated by the test's scalar allocation override. */
void operator delete(void* pointer) noexcept { std::free(pointer); }
/** Releases sized scalar storage allocated by the test override. */
void operator delete(void* pointer, std::size_t) noexcept { std::free(pointer); }
/** Allocates array storage while honoring the test's pause injection switch. */
void* operator new[](std::size_t size) {
    if (pauseBufferAllocation.load()) {
        allocationEntered.store(true);
        while (pauseBufferAllocation.load()) {
            std::this_thread::yield();
        }
    }
    return ::operator new(size);
}
/** Releases storage allocated by the test's array allocation override. */
void operator delete[](void* pointer) noexcept { std::free(pointer); }
/** Releases sized array storage allocated by the test override. */
void operator delete[](void* pointer, std::size_t) noexcept { std::free(pointer); }
/** Performs a non-throwing array allocation through the test override. */
void* operator new[](std::size_t size, const std::nothrow_t&) noexcept {
    try {
        return ::operator new[](size);
    } catch (...) {
        return nullptr;
    }
}
/** Releases non-throwing array storage allocated by the test override. */
void operator delete[](void* pointer, const std::nothrow_t&) noexcept { std::free(pointer); }
// NOLINTEND(cppcoreguidelines-init-variables,cppcoreguidelines-no-malloc,misc-unused-parameters,readability-inconsistent-declaration-parameter-name,readability-named-parameter)

/** Exercises allocation failure, nonblocking cancellation, and ring-buffer ordering. */
int main() {
    using sevenzip::Chunk;
    using sevenzip::ChunkQueue;
    using Status = ChunkQueue::Status;
    constexpr std::array<uint8_t, 9> bytes = {0, 1, 2, 3, 4, 5, 6, 7, 8};

    // Assertions intentionally execute queue operations in this standalone test.
    // NOLINTBEGIN(bugprone-assert-side-effect)

    // Finish must publish its partial even when all subsequent allocations
    // fail and the ordinary queue slots are already full.
    {
        ChunkQueue queue(4, 2, []() {});
        assert(queue.Write(bytes.data(), bytes.size()));
        failAllocation = true;
        queue.Finish();
        size_t offset = 0;
        Chunk chunk;
        while (queue.TryTake(&chunk) == Status::kChunk) {
            for (size_t i = 0; i < chunk.length; ++i) {
                assert(chunk.data[i] == bytes[offset++]);
            }
        }
        assert(offset == bytes.size());
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
        assert(!queue.Write(bytes.data(), bytes.size()));
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
            assert(!queue.Write(bytes.data(), bytes.size()));
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
                assert(queue.Write(bytes.data(), bytes.size()));
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
                assert(chunk.data[i] == bytes[offset++ % bytes.size()]);
            }
        }
        producer.join();
        assert(offset == 20000 * bytes.size());
    }
    // NOLINTEND(bugprone-assert-side-effect)
    std::cout << "queue allocation-failure, nonblocking, and wraparound tests passed\n";
}
