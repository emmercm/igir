#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

#include "chunkQueue.h"
#include "jobRegistry.h"
#include "sevenZip.h"

namespace sevenzip {

/**
 * Runs 7-Zip's push extraction on a self-owning producer thread and exposes bounded, nonblocking reads.
 *
 * One pump owns one archive and entry. JavaScript cancellation only signals and
 * drops its reference; the detached producer retains the pump while unwinding,
 * so the event loop never joins it. N-API interaction is supplied by callbacks.
 */
class Pump {
   public:
    // How much decompressed output may sit buffered ahead of the consumer. This
    // is the back-pressure bound: past it the producer blocks in Write() until a
    // read drains a chunk, so a caller that stops reading a 40 GiB entry costs a
    // megabyte, not 40 GiB. A chunk larger than this still gets a floor of two
    // queued chunks, so the consumer can be handed one while the next is
    // already waiting.
    static constexpr size_t kReadAheadBytes = 1U << 20U;  // 1 MiB

    // The largest chunk size a caller may ask for. Every queued chunk is
    // allocated at this size, so an unclamped value straight from JavaScript
    // would be an allocation the caller controls; this is generous for a stream
    // high-watermark and far short of a denial of service.
    static constexpr size_t kMaxChunkBytes = 1U << 24U;  // 16 MiB

    /**
     * Constructs, registers, and starts a self-owning decoder pump.
     *
     * A validated `entryIndex` hints the scan for `entryPath`; without a path,
     * the archive must contain exactly one item. `chunkBytes` controls every
     * returned chunk except the last. Producer-thread callbacks `onReady` and
     * `onExit` must not throw. Startup throws if thread creation fails or the
     * environment registry is already draining, without leaving a live worker.
     */
    static std::shared_ptr<Pump> Start(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
                                       std::optional<uint32_t> entryIndex, size_t chunkBytes,
                                       std::shared_ptr<JobRegistry> registry, std::function<void()> onReady,
                                       std::function<void()> onExit);

    /** Pump state belongs to one producer/consumer pair and cannot be copied. */
    Pump(const Pump&) = delete;
    /** Pump state belongs to one producer/consumer pair and cannot be copy-assigned. */
    Pump& operator=(const Pump&) = delete;
    /** Pump state contains synchronization primitives and cannot be moved. */
    Pump(Pump&&) = delete;
    /** Pump state contains synchronization primitives and cannot be move-assigned. */
    Pump& operator=(Pump&&) = delete;
    /** Releases pump storage after its detached producer and consumer have both let go. */
    ~Pump() = default;

    /** Takes one chunk without blocking; pending arms `onReady`, and terminal producer failure throws at end. */
    ChunkQueue::Status TryRead(Chunk* out);

    /** Idempotently signals abort, releases queue backpressure, and returns without joining the producer. */
    void Cancel() noexcept;

   private:
    /** Stores immutable extraction arguments and constructs the bounded output queue. */
    Pump(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
         std::optional<uint32_t> entryIndex, size_t chunkBytes, std::function<void()> onReady);

    /** Contains every extraction exception to prevent thread termination and always finishes the output queue. */
    void Run();

    /** Opens the archive, resolves the item, and drives 7-Zip extraction, reporting failure by throwing to Run. */
    void Extract();

    /** Records the first producer error for delivery when the consumer reaches terminal state. */
    void SetError(std::string message);

    /** Resolves a named entry, validated hint, or sole unnamed entry and reports failures through SetError. */
    HRESULT ResolveEntryIndex(IInArchive& archive, uint32_t* out);

    /** Describes the requested entry consistently in native error messages. */
    std::string EntryLabel() const;

    /** Builds the allocation-failure message usable by either the unwinding producer or terminating consumer. */
    std::string OutOfMemoryMessage() const;

    std::string path_;
    uint32_t formatIndex_;
    std::optional<std::string> entryPath_;
    std::optional<uint32_t> entryIndex_;
    ChunkQueue queue_;
    std::atomic<bool> abort_{false};
    std::mutex errorMutex_;
    std::string error_;
    std::function<void()> onExit_;
    // Held so the thread can unregister itself as it exits, and so the registry
    // outlives the Pump whatever order teardown happens in
    std::shared_ptr<JobRegistry> registry_;
    JobRegistry::Token token_ = JobRegistry::kInvalidToken;
};

}  // namespace sevenzip
