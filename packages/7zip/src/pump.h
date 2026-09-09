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

// Runs 7-Zip's push-based Extract() on a dedicated thread and exposes its output
// as a non-blocking pull. One Pump owns one archive, one entry, and one thread.
//
// The thread is never joined. Start() hands the producer a shared_ptr to the
// Pump, so the object lives as long as the thread needs it and teardown is only:
// abort, drop the pointer, return. The consumer never waits for the decoder to
// notice the abort, which for a large solid .7z folder can take seconds, and
// the consumer is the event loop thread, reaching the destructor from close()
// or from the garbage collector.
//
// Nothing here includes <napi.h>: the two callbacks that reach back into N-API
// are std::functions the caller supplies.
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

    // Creates the Pump and starts its thread. Throws std::system_error if the
    // OS refuses the thread, in which case nothing was started.
    //
    // `entryPath` is resolved against the archive this Pump opens anyway, so
    // naming an entry costs one pass over the already-parsed item table.
    //
    // `entryIndex` is an optional hint: where a previous listing saw that entry.
    // It is checked against `entryPath` and used only when it still matches, so
    // a stale one costs the scan it was meant to avoid and nothing else. It is
    // never used on its own.
    //
    // No path means the archive's only entry, which is how the formats that
    // record no names (`.Z`, `.bz2`, `.lzma`, `.001`) are addressed. An archive
    // holding more than one entry is then an error rather than a silent pick.
    //
    // `chunkBytes` is the size of every chunk TryRead() returns but the last.
    //
    // `onReady` is called on the producer thread when a TryRead() that returned
    // kPending could now proceed; `onExit` exactly once, on the producer thread,
    // as the last thing it does. Neither may throw.
    //
    // `registry` is the environment's live-job registry. The Pump registers
    // itself for the lifetime of its thread so that environment teardown can
    // cancel it and wait for it. Throws std::runtime_error if the registry is
    // already draining, since nothing would then be left to wait for the new
    // thread.
    static std::shared_ptr<Pump> Start(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
                                       std::optional<uint32_t> entryIndex, size_t chunkBytes,
                                       std::shared_ptr<JobRegistry> registry, std::function<void()> onReady,
                                       std::function<void()> onExit);

    Pump(const Pump&) = delete;
    Pump& operator=(const Pump&) = delete;
    Pump(Pump&&) = delete;
    Pump& operator=(Pump&&) = delete;
    ~Pump() = default;

    // Takes the next chunk of decompressed output without ever blocking.
    // kPending means `onReady` will fire; kEnd means the entry is done. Throws
    // std::runtime_error carrying the producer's failure, if it had one, on the
    // kEnd that follows it.
    ChunkQueue::Status TryRead(Chunk* out);

    // Tells the producer to stop. Returns immediately: it does not wait for the
    // producer to notice, and it does not join. Every later TryRead() reports
    // kEnd. Safe to call more than once, and from a destructor.
    void Cancel() noexcept;

   private:
    Pump(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
         std::optional<uint32_t> entryIndex, size_t chunkBytes, std::function<void()> onReady);

    // The producer thread's body. Nothing may escape it: an exception leaving a
    // std::thread's callable calls std::terminate(). It catches everything
    // internally rather than being marked noexcept, which would turn such a
    // throw into that same terminate().
    void Run();

    // The extraction, which reports failure by throwing; Run() catches
    void Extract();

    void SetError(std::string message);

    // Resolves `entryPath_`, or the archive's sole entry when there is none, to
    // the index 7-Zip extracts by. Reports its own failures through SetError().
    HRESULT ResolveEntryIndex(IInArchive& archive, uint32_t* out);

    std::string EntryLabel() const;

    // The message reported when the queue could not allocate. Both the producer
    // (as it unwinds) and the consumer (if it reaches the end of the stream
    // first) can be the one to report it.
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
