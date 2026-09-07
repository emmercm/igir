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
// Pump, so the object outlives the consumer's reference by exactly as long as
// the thread needs it. That matters because the alternative -- joining in the
// destructor -- meant the consumer waited for the decoder to notice the abort,
// and a decoder skipping through a large solid .7z folder can go seconds
// between the callbacks where it checks. Since the destructor is reached from
// close() and from the garbage collector, both of which run on the event loop
// thread, that wait was a stall of the entire process. Now teardown is: abort,
// drop the pointer, return. The thread finishes unwinding on its own time and
// releases the last reference wherever it happens to be.
//
// Nothing here includes <napi.h>. The two places this has to reach back into
// N-API -- "a read that was waiting can now proceed" and "the producer has
// exited" -- are std::functions supplied by entryReader.cpp.
class Pump {
   public:
    // How much decompressed output may sit buffered ahead of the consumer. This
    // is the back-pressure bound: past it the producer blocks in Write() until a
    // read drains a chunk, so a caller that stops reading a 40 GiB entry costs a
    // megabyte, not 40 GiB. A chunk size larger than this still gets two chunks
    // of slack, because one in flight and one being filled is the least that
    // keeps the producer from stalling on every single read.
    static constexpr size_t kReadAheadBytes = 1U << 20U;  // 1 MiB

    // The largest chunk size a caller may ask for. Chunks are allocated up
    // front, so an unclamped value straight from JavaScript is an allocation the
    // caller controls; this is generous for a stream high-watermark and far
    // short of a denial of service.
    static constexpr size_t kMaxChunkBytes = 1U << 24U;  // 16 MiB

    // Creates the Pump and starts its thread. Throws std::system_error if the
    // OS refuses the thread, in which case nothing was started.
    //
    // `entryPath` is resolved against the archive this Pump opens for extraction
    // anyway, so naming an entry by name costs one pass over the already-parsed
    // item table -- never a second open, and never a round trip through
    // JavaScript.
    //
    // `entryIndex` is an optional hint: where a previous listing saw that entry.
    // It is checked against `entryPath` (one property read) and used only when
    // it still matches, so a stale one costs the scan it was meant to avoid and
    // nothing else. It is never used on its own.
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
    // cancel it and wait for it; see jobRegistry.h. Throws std::runtime_error
    // if the registry is already draining, which means the environment is going
    // away and there would be nothing left to wait for a new thread.
    static std::shared_ptr<Pump> Start(std::string path, uint32_t formatIndex,
                                       std::optional<std::string> entryPath,
                                       std::optional<uint32_t> entryIndex, size_t chunkBytes,
                                       std::shared_ptr<JobRegistry> registry,
                                       std::function<void()> onReady,
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
    // std::thread's callable calls std::terminate(). It is not marked noexcept
    // -- that would turn such a throw into the very terminate() we are avoiding;
    // it catches everything internally instead.
    void Run();

    // The extraction itself, so that Run() needs exactly one try/catch.
    void Extract();

    void SetError(std::string message);

    // Resolves `entryPath_` -- or, when there is none, the archive's sole entry
    // -- to the index 7-Zip extracts by. Reports its own failures through
    // SetError().
    HRESULT ResolveEntryIndex(IInArchive& archive, uint32_t* out);

    std::string EntryLabel() const;

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
    // outlives the Pump whatever order teardown happens in.
    std::shared_ptr<JobRegistry> registry_;
    JobRegistry::Token token_ = JobRegistry::kInvalidToken;
};

}  // namespace sevenzip
