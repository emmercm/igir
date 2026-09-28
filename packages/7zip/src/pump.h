#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

#include "jobRegistry.h"
#include "outputSlot.h"
#include "sevenZip.h"

namespace sevenzip {

/**
 * Runs 7-Zip's push extraction on a self-owning producer thread and exposes nonblocking reads into lent buffers.
 *
 * One pump owns one archive and entry. JavaScript cancellation only signals and
 * drops its reference; the detached producer retains the pump while unwinding,
 * so the event loop never joins it. N-API interaction is supplied by callbacks.
 */
class Pump {
   public:
    /**
     * Constructs, registers, and starts a self-owning decoder pump.
     *
     * A validated `entryIndex` hints the scan for `entryPath`; without a path,
     * the archive must contain exactly one item. Producer-thread callbacks `onReady` and
     * `onExit` must not throw. Startup throws if thread creation fails or the
     * environment registry is already draining, without leaving a live worker.
     */
    static std::shared_ptr<Pump> Start(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
                                       std::optional<uint32_t> entryIndex, std::shared_ptr<JobRegistry> registry,
                                       std::function<void()> onReady, std::function<void()> onExit);

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

    /** Lends the producer `capacity` bytes at `data` to fill; see OutputSlot::Lend. */
    void Lend(uint8_t* data, size_t capacity);

    /** Takes back the lent buffer without blocking; pending arms `onReady`, and terminal producer failure throws at
     * end. */
    OutputSlot::Status TryRead(size_t* length);

    /**
     * Idempotently signals abort, unblocks the producer, and returns without joining it.
     *
     * Once it returns, the producer will not touch the lent buffer again.
     */
    void Cancel() noexcept;

   private:
    /** Stores immutable extraction arguments and constructs the output slot. */
    Pump(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
         std::optional<uint32_t> entryIndex, std::function<void()> onReady);

    /** Contains every extraction exception to prevent thread termination and always finishes the output slot. */
    void Run();

    /** Opens the archive, resolves the item, and drives 7-Zip extraction, reporting failure by throwing to Run. */
    void Extract();

    /** Records the first producer error for delivery when the consumer reaches terminal state. */
    void SetError(std::string message);

    /** Resolves a named entry, validated hint, or sole unnamed entry and reports failures through SetError. */
    HRESULT ResolveEntryIndex(IInArchive& archive, uint32_t* out);

    /** Describes the requested entry consistently in native error messages. */
    std::string EntryLabel() const;

    /** Builds the output-failure message usable by either the unwinding producer or terminating consumer. */
    std::string OutputFailureMessage() const;

    std::string path_;
    uint32_t formatIndex_;
    std::optional<std::string> entryPath_;
    std::optional<uint32_t> entryIndex_;
    OutputSlot slot_;
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
