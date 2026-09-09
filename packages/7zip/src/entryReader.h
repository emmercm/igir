#pragma once

#include <napi.h>

#include <memory>
#include <optional>

#include "pump.h"
#include "tsfnHandle.h"

namespace sevenzip {

// The JS-visible pull reader: `read()` resolves with the next chunk of an
// entry's decompressed bytes, or `null` at the end.
//
// No thread this runs on ever waits on another. A read is answered on the event
// loop thread, synchronously, from a chunk the producer has already finished.
// That is the steady state, since the producer runs ahead by a bounded amount.
// Only when the consumer catches up does a read park: its promise is held, and
// the producer wakes it through a ThreadSafeFunction once the next chunk is
// ready.
// The one thread allowed to block is the producer, on a full queue.
class EntryReader : public Napi::ObjectWrap<EntryReader> {
   public:
    static Napi::Function GetClass(Napi::Env env);

    // (path: string, formatIndex: number, entryPath?: string, entryIndex?: number,
    //  chunkBytes?: number)
    explicit EntryReader(const Napi::CallbackInfo& info);
    ~EntryReader() override;

    EntryReader(const EntryReader&) = delete;
    EntryReader& operator=(const EntryReader&) = delete;
    EntryReader(EntryReader&&) = delete;
    EntryReader& operator=(EntryReader&&) = delete;

    // Resolves with a Buffer of exactly `chunkBytes`, a shorter Buffer for the
    // last chunk of the entry, or null at the end of it. Rejects if the producer
    // failed, if a read is already outstanding, or after close().
    Napi::Value Read(const Napi::CallbackInfo& info);

    // Abandons the rest of the entry. Idempotent. Returns immediately: it tells
    // the producer to stop and drops the reference to it, but never waits for it
    // to notice.
    void Close(const Napi::CallbackInfo& info);

    // Event loop thread, via the ThreadSafeFunction. Public only because the
    // callback that invokes it is a plain lambda held by the producer, which
    // cannot be a member. Not part of the JavaScript surface.
    void OnProducerReady(Napi::Env env);

   private:
    // Shared between this object and the producer thread so that each can
    // outlive the other. The producer needs it to report a ready chunk or its
    // own exit even after the reader has been garbage collected; the reader
    // needs it to keep the ThreadSafeFunction alive until the producer lets go.
    struct Bridge {
        std::shared_ptr<TsfnHandle> tsfn;
        // Touched only on the event loop thread: set at construction, cleared by
        // ~EntryReader, and read by the ThreadSafeFunction callback, all three
        // on that one thread, so a reader that is gone is simply seen as null
        // rather than raced with
        EntryReader* reader = nullptr;
    };

    // Settles `deferred` from one non-blocking read of the pump. Returns false,
    // having settled nothing, when the producer has no chunk ready yet. That
    // re-arms the ready callback, so a caller may simply park and be called
    // again. Sets *settled once `deferred` has been settled, so a caller's
    // catch-all cannot settle it a second time.
    bool TrySettle(Napi::Env env, const Napi::Promise::Deferred& deferred, bool* settled);

    // Releases the parked promise's hold on this object and the event loop.
    // Must be the last thing a settling path does: it can drop the final
    // reference to `this`.
    void ReleasePending(Napi::Env env);

    std::shared_ptr<Pump> pump_;
    std::shared_ptr<Bridge> bridge_;
    // The one outstanding read, if it could not be answered immediately. Also
    // the "a read is in flight" flag, since there is only ever one.
    std::optional<Napi::Promise::Deferred> pending_;
    // False until the constructor has run to completion. Its argument checks
    // report a TypeError and return, leaving no Pump and no bridge; a caller
    // that held on to the half-built object must be told the reader was never
    // opened, not handed the empty read a null Pump would otherwise look like.
    bool constructed_ = false;
    bool closed_ = false;
};

}  // namespace sevenzip
