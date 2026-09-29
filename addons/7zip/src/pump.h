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
 * Opens an archive on the caller's thread, then runs 7-Zip's push extraction on a self-owning
 * producer thread and exposes nonblocking reads into lent buffers.
 *
 * The caller runs the open on the libuv thread pool, as Node.js runs its own fs
 * calls. Only extraction gets a thread of its own: IInArchive::Extract pushes
 * its output and blocks until the reader lends a buffer, and a pool thread
 * blocked on JavaScript could starve the very work that would unblock it.
 *
 * One pump owns one archive and entry. JavaScript cancellation only signals and
 * drops its reference; the pump's owner retains it while unwinding, so the
 * event loop never joins it. N-API interaction is supplied by callbacks.
 */
class Pump {
   public:
    /**
     * Constructs and registers a decoder pump without opening anything.
     *
     * A validated `entryIndex` hints the scan for `entryPath`; without a path,
     * the archive must contain exactly one item. Callbacks `onReady` and `onExit`
     * run off the event loop thread and must not throw. Throws if the environment
     * registry is already draining, without registering anything. The caller
     * must then hand the pump to exactly one of Run() or Abandon().
     */
    static std::shared_ptr<Pump> Create(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
                                        std::optional<uint32_t> entryIndex, std::shared_ptr<JobRegistry> registry,
                                        std::function<void()> onReady, std::function<void()> onExit);

    /**
     * Opens the archive and resolves the entry on the calling thread, then starts the producer thread.
     *
     * Blocks on file I/O, so it belongs on a libuv pool thread. Any failure,
     * including failing to start the thread, reaches the consumer through
     * TryRead(); a cancel during the open ends the output without an error.
     */
    static void Run(std::shared_ptr<Pump> pump) noexcept;

    /** Ends the output and gives back the registration of a pump whose Run() will never be called. */
    static void Abandon(std::shared_ptr<Pump> pump) noexcept;

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

    /**
     * Takes back the lent buffer without blocking. A pending result arms `onReady`, and a
     * terminal producer failure throws once the output is exhausted.
     */
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

    /** Opens the archive and resolves the item, returning whether extraction should start; may throw to Run. */
    bool Open();

    /** Drives 7-Zip extraction of the opened archive, reporting failure by throwing to the producer thread. */
    void Extract();

    /** Closes the archive, if it is still open, and finishes the output slot, on every path. */
    void Finish() noexcept;

    /** Runs onExit and gives back the registration; the final action of whichever thread ends the pump. */
    static void Exit(std::shared_ptr<Pump> pump) noexcept;

    /** Records the exception being handled as the producer error; only called from a catch handler. */
    void SetCurrentError() noexcept;

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

    // Written by Open() on a pool thread and read by the producer thread, which
    // starts only after Open() returns
    OpenedArchive opened_;
    uint32_t resolvedIndex_ = 0;

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
