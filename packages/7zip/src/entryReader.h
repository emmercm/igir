#pragma once

#include <napi.h>

#include <memory>
#include <optional>

#include "pump.h"

namespace sevenzip {

// The JS-visible pull reader: `read()` resolves with the next chunk of an
// entry's decompressed bytes, or `null` at the end.
//
// The one rule the whole class is built around is that NO thread ever waits on
// another. The event loop thread must not, for the obvious reason. The libuv
// pool threads must not either, and less obviously: they are a small, shared,
// fixed-size resource, and every one of them parked waiting on a decoder is one
// that fs, dns and every other consumer in the process cannot have. Four
// concurrent reads on a four-thread pool would deadlock everything else.
//
// So there is no worker on the read path at all. A read is answered on the event
// loop thread, synchronously, from a chunk the producer has already finished --
// which is the steady state, since the producer runs ahead by up to
// Pump::kReadAheadBytes. Only when the consumer has caught up does a read park:
// its promise is held, and the producer wakes it through a ThreadSafeFunction
// once the next chunk is ready. Exactly one thread in this design is ever
// allowed to block, and it is the dedicated producer inside Pump, blocking on a
// full queue -- which is not a stall but the back-pressure that bounds memory.
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
    // Shared between this object and the producer thread, so that each can
    // outlive the other. The producer holds it because it must be able to say
    // "a chunk is ready" and "I have exited" even if the reader has already been
    // garbage collected; the reader holds it to keep the ThreadSafeFunction
    // alive until the producer has released it.
    struct Bridge {
        Napi::ThreadSafeFunction tsfn;
        // Touched only on the event loop thread: set at construction, cleared by
        // ~EntryReader, and read by the ThreadSafeFunction callback -- all three
        // on that one thread, so a reader that is gone is simply seen as null
        // rather than raced with.
        EntryReader* reader = nullptr;
    };

    // The bodies of the entry points above. Each is called from inside exactly
    // one try/catch, because N-API is built here with NAPI_DISABLE_CPP_EXCEPTIONS
    // and an exception unwinding through V8's C ABI aborts the process.
    void Construct(const Napi::CallbackInfo& info);
    // Sets *settled once the deferred has been settled or parked, so Read()'s
    // catch cannot settle it a second time.
    void StartRead(const Napi::CallbackInfo& info, const Napi::Promise::Deferred& deferred,
                   bool* settled);
    void Shutdown(Napi::Env env);

    // Settles `deferred` from one non-blocking read of the pump. Returns false,
    // having settled nothing, when the producer has no chunk ready yet -- which
    // re-arms the ready callback, so a caller may simply park and be called
    // again.
    bool TrySettle(Napi::Env env, const Napi::Promise::Deferred& deferred, bool* settled);

    // Releases the parked promise's hold on this object and the event loop.
    // Must be the last thing a settling path does: it can drop the final
    // reference to `this`.
    void ReleasePending(Napi::Env env);

    std::shared_ptr<Pump> pump_;
    std::shared_ptr<Bridge> bridge_;
    // The one outstanding read, if it could not be answered immediately. Also
    // the "a read is in flight" flag -- there is only ever one.
    std::optional<Napi::Promise::Deferred> pending_;
    bool closed_ = false;
};

}  // namespace sevenzip
