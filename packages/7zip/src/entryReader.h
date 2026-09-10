#pragma once

#include <napi.h>

#include <memory>
#include <optional>

#include "asyncSignal.h"
#include "pump.h"

namespace sevenzip {

/**
 * Exposes one archive entry as a pull-based JavaScript reader backed by a decoder thread.
 *
 * Reads consume completed chunks without blocking the event loop. A read parks
 * only after catching the bounded producer, which wakes it through AsyncSignal;
 * only the producer may block, when the queue is full.
 */
class EntryReader : public Napi::ObjectWrap<EntryReader> {
   public:
    /** Defines the JavaScript EntryReader class and its read and close methods. */
    static Napi::Function GetClass(Napi::Env env);

    /** Validates `(path, formatIndex, entryPath?, entryIndex?, chunkBytes?)` and starts the decoder pump. */
    explicit EntryReader(const Napi::CallbackInfo& info);
    /** Detaches callbacks and cancels any decoder still running without blocking the loop. */
    ~EntryReader() override;

    /** Reader identity and its JavaScript wrapper cannot be copied. */
    EntryReader(const EntryReader&) = delete;
    /** Reader identity and its JavaScript wrapper cannot be copy-assigned. */
    EntryReader& operator=(const EntryReader&) = delete;
    /** Reader identity and its JavaScript wrapper cannot be moved. */
    EntryReader(EntryReader&&) = delete;
    /** Reader identity and its JavaScript wrapper cannot be move-assigned. */
    EntryReader& operator=(EntryReader&&) = delete;

    /**
     * Returns a promise for a full decompressed chunk, a shorter final chunk,
     * or null at end-of-stream; rejects native failure, concurrent reads, and reads after close.
     */
    Napi::Value Read(const Napi::CallbackInfo& info);

    /** Idempotently cancels without waiting, settles a parked read with end-of-stream, and releases references. */
    void Close(const Napi::CallbackInfo& info);

    /** Retries a parked read on the event loop; public for the native callback, not the JavaScript surface. */
    void OnProducerReady(Napi::Env env);

   private:
    /**
     * Lets the reader and producer outlive one another through a shared signal
     * while keeping the JavaScript wrapper pointer confined to the loop thread.
     */
    struct Bridge {
        std::shared_ptr<AsyncSignal> signal;
        // Touched only on the event loop thread: set at construction, cleared by
        // ~EntryReader, and read by the AsyncSignal callback, all three
        // on that one thread, so a reader that is gone is simply seen as null
        // rather than raced with
        EntryReader* reader = nullptr;
    };

    /**
     * Attempts one nonblocking pump read and settles `deferred` when possible.
     * Returns false and rearms notification while pending; sets `settled` to
     * prevent callers from settling the promise twice.
     */
    bool TrySettle(Napi::Env env, const Napi::Promise::Deferred& deferred, bool* settled);

    /** Releases a parked read's object and loop references; must be last because it may destroy `this`. */
    void ReleasePending(Napi::Env env);

    std::shared_ptr<Pump> pump_;
    Napi::ObjectReference readFailure_;
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
