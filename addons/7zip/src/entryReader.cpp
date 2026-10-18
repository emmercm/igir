#include "entryReader.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

#include "addon.h"
#include "outputSlot.h"
#include "poolTask.h"

namespace sevenzip {

#ifdef __EMSCRIPTEN__
// Copies bytes into a new Buffer. It calls Node-API directly because Napi::Buffer makes emnapi mirror
// the Buffer on the WebAssembly heap until garbage collection.
static Napi::Value CopyToBuffer(Napi::Env env, const uint8_t* data, size_t length) {
    napi_value value = nullptr;
    napi_status const status = napi_create_buffer_copy(env, length, data, nullptr, &value);
    NAPI_THROW_IF_FAILED(env, status, Napi::Value());
    return {env, value};
}
#endif

Napi::Function EntryReader::GetClass(Napi::Env env) {
    return DefineClass(env, "EntryReader",
                       {
                           InstanceMethod("read", &EntryReader::Read),
                           InstanceMethod("close", &EntryReader::Close),
                       });
}

/** Validates reader arguments on the loop thread, reporting TypeError and retaining the existing output locals. */
static bool ParseReadArguments(const Napi::CallbackInfo& info, std::optional<std::string>& entryPath,
                               std::optional<uint32_t>& entryIndex, size_t& chunkBytes) {
    Napi::Env const env = info.Env();
    // An entry is named by path, or not named at all. An index may accompany
    // the path, but only as a hint the Pump verifies against it.
    bool const named = info.Length() >= 3 && info[2].IsString();
    bool const unnamed = info.Length() < 3 || info[2].IsUndefined();
    bool const hinted = info.Length() >= 4 && info[3].IsNumber();
    bool const unhinted = info.Length() < 4 || info[3].IsUndefined();
    bool const sized = info.Length() < 5 || info[4].IsUndefined() || info[4].IsNumber();
    if (!info[0].IsString() || !info[1].IsNumber() || (!named && !unnamed) || (!hinted && !unhinted) || !sized) {
        Napi::TypeError::New(env,
                             "expected (path: string, formatIndex: number, entryPath?: string, "
                             "entryIndex?: number, chunkBytes?: number)")
            .ThrowAsJavaScriptException();
        return false;
    }
    if (named) {
        entryPath = info[2].As<Napi::String>().Utf8Value();
        if (entryPath->empty()) {
            // An empty path would otherwise be indistinguishable from naming no
            // entry at all, silently extracting a single-entry archive's member
            Napi::TypeError::New(env, "entry path must not be empty").ThrowAsJavaScriptException();
            return false;
        }
    }
    // An out-of-range or non-integral hint is not an error: it cannot match
    // any item, and the Pump falls back to the scan
    if (hinted) {
        double const requested = info[3].As<Napi::Number>().DoubleValue();
        if (requested >= 0 && requested <= UINT32_MAX && requested == std::floor(requested)) {
            entryIndex = static_cast<uint32_t>(requested);
        }
    }

    // Fixed for the life of the reader rather than passed to each read(),
    // so that every chunk but the last is the same size
    if (info.Length() >= 5 && info[4].IsNumber()) {
        double const requested = info[4].As<Napi::Number>().DoubleValue();
        if (!(requested >= 1)) {
            // Catches 0, negatives and NaN alike. A zero-byte chunk would
            // make every read return an empty buffer.
            Napi::TypeError::New(env, "chunkBytes must be at least 1").ThrowAsJavaScriptException();
            return false;
        }
        if (requested > static_cast<double>(EntryReader::kMaxChunkBytes)) {
            Napi::RangeError::New(env, "chunkBytes is too large").ThrowAsJavaScriptException();
            return false;
        }
        chunkBytes = static_cast<size_t>(requested);
    }

    return true;
}

EntryReader::EntryReader(const Napi::CallbackInfo& info) : Napi::ObjectWrap<EntryReader>(info) {
    try {
        Napi::Env const env = info.Env();

        std::optional<std::string> entryPath;
        std::optional<uint32_t> entryIndex;
        size_t chunkBytes = kDefaultChunkBytes;
        if (!ParseReadArguments(info, entryPath, entryIndex, chunkBytes)) {
            return;
        }

        // The bridge exists before the producer does, because the producer
        // captures it. It is created unreferenced (the `false`), so holding a
        // reader open does not by itself keep the process alive; a paused read
        // re-references it for exactly as long as it is paused.
        auto bridge = std::make_shared<Bridge>();
        readFailure_ = Napi::Persistent(Napi::Error::New(env, "failed to allocate the read result").Value());
        bridge->signal = AsyncSignal::Create(env, "sevenzip::EntryReader", false, [bridge](Napi::Env callbackEnv) {
            if (callbackEnv != nullptr && bridge->reader != nullptr) {
                bridge->reader->OnProducerReady(callbackEnv);
            }
            return false;
        });
        bridge->reader = this;

        std::shared_ptr<Pump> pump;
        try {
            pump = Pump::Create(
                info[0].As<Napi::String>().Utf8Value(), info[1].As<Napi::Number>().Uint32Value(), std::move(entryPath),
                entryIndex, Registry(env), [bridge]() { bridge->signal->Notify(); },
                [bridge]() {
                    // Pool or producer thread, exactly once, after the archive
                    // and every volume it opened are closed. Recorded before
                    // the notification, so the callback it wakes sees it, and
                    // the signal closes after that delivery; teardown may close
                    // it independently.
                    bridge->exited.store(true, std::memory_order_release);
                    bridge->signal->Notify();
                    bridge->signal->Release();
                });

            // The archive is opened and the entry found on the pool, never on
            // this thread. Reads that arrive first simply pause until the
            // producer lends its first chunk, or the open fails.
            PoolTask::Queue(
                env, "sevenzip::EntryReader", [pump]() mutable { Pump::Run(std::move(pump)); },
                [pump]() mutable { Pump::Abandon(std::move(pump)); });
        } catch (...) {
            // Either nothing was created, so onExit will never run, or the
            // task was abandoned, which already ran it. Release() is
            // idempotent, so request signal closure either way.
            bridge->signal->Release();
            throw;
        }

        bridge_ = std::move(bridge);
        pump_ = std::move(pump);
        chunkBytes_ = chunkBytes;
        constructed_ = true;
    } catch (...) {
        // Reading the arguments allocates, creating the AsyncSignal can
        // fail, and queueing the pool task can fail
        Napi::Error::New(info.Env(), "failed to open the entry for reading").ThrowAsJavaScriptException();
    }
}

EntryReader::~EntryReader() {
    if (bridge_) {
        // Both this and the callback that reads it run on the event loop
        // thread, so from here on the producer's notifications find no reader.
        // The AsyncSignal stays alive inside the bridge until the
        // producer releases it.
        bridge_->reader = nullptr;
    }

    if (pump_) {
        pump_->Cancel();
    }

    // Drops this side's reference. If the producer is still running it holds the
    // other one and will finish unwinding on its own; nothing here waits.
    pump_.reset();

    // `lent_` or `scratch_` is released by its own destructor after this body,
    // so only after Cancel(), which guarantees the producer has stopped writing
    // into it; unlike Reset(), its destructor cannot throw.
}

bool EntryReader::TryFinishRead(Napi::Env env, const Napi::Promise::Deferred& deferred, bool* finished) {
    size_t length = 0;
    OutputSlot::Status status = OutputSlot::Status::kEnd;
    try {
        status = pump_->TryRead(&length);
    } catch (const std::exception& e) {
        // The producer's own message, which names the archive, the entry and
        // what went wrong with it. It only throws at the end, so nothing is
        // lent any more.
        ReleaseLent();
        *finished = true;
        deferred.Reject(Napi::Error::New(env, e.what()).Value());
        return true;
    } catch (...) {
        ReleaseLent();
        *finished = true;
        deferred.Reject(Napi::Error::New(env, "unknown 7-Zip read error").Value());
        return true;
    }

    if (status == OutputSlot::Status::kPending) {
        return false;
    }
    if (status == OutputSlot::Status::kEnd) {
        ReleaseLent();
        *finished = true;
        deferred.Resolve(env.Null());
        return true;
    }
    // Only the final chunk comes back short
    bool const isShort = length < lentBytes_;
    delivered_ += length;

#ifdef __EMSCRIPTEN__
    // The slot has handed the scratch memory back. Copied before resolving, so
    // that failing to allocate the copy still rejects the read.
    Napi::Value const chunk = CopyToBuffer(env, scratch_.get(), length);
    *finished = true;
    deferred.Resolve(chunk);
#else
    // The slot has handed the buffer back, so the producer is done with it
    Napi::Buffer<uint8_t> const buffer = lent_.Value();
    lent_.Reset();
    *finished = true;
    if (!isShort) {
        deferred.Resolve(buffer);
    } else {
        // A view rather than a copy, at the cost of pinning the unused tail
        // until the view is collected
        deferred.Resolve(
            buffer.Get("subarray")
                .As<Napi::Function>()
                .Call(buffer, {Napi::Number::New(env, 0), Napi::Number::New(env, static_cast<double>(length))}));
    }
#endif
    return true;
}

Napi::Value EntryReader::Read(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);

    // A napi_deferred may be resolved or rejected exactly once, and doing so
    // twice is undefined behavior rather than an error, so the catch-all below
    // has to know whether the body already got there
    bool finished = false;
    bool paused = false;
    try {
        if (closed_) {
            finished = true;
            deferred.Reject(Napi::Error::New(env, "read after close").Value());
        } else if (pending_.has_value()) {
            finished = true;
            deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        } else if (!constructed_ || !pump_) {
            // The constructor reported a TypeError and returned without starting
            // anything. Resolving with null here would tell a caller the entry
            // was empty, which is a different answer, and a silently wrong one.
            finished = true;
            deferred.Reject(Napi::Error::New(env, "the entry reader was never opened").Value());
        } else {
            // Once the producer has finished, nothing is left to decode, so nothing is lent: the
            // slot reports the end, or the producer's failure, without a buffer
            if (!pump_->Done()) {
                // No more than the entry has left, so that its final chunk doesn't allocate more
                // memory than necessary. The declared size is untrusted, so once it is reached the
                // read lends one byte rather than none: an entry longer than declared still has
                // somewhere to go, instead of blocking the producer for good.
                lentBytes_ =
                    static_cast<size_t>(std::clamp<uint64_t>(Remaining().value_or(chunkBytes_), 1, chunkBytes_));
#ifdef __EMSCRIPTEN__
                // Allocated once and reused, since reads are one at a time
                if (!scratch_) {
                    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
                    scratch_ = std::make_unique_for_overwrite<uint8_t[]>(chunkBytes_);
                }
                pump_->Lend(scratch_.get(), lentBytes_);
#else
                // Referenced before it is lent, so that V8 cannot collect it while
                // the producer holds its address
                Napi::Buffer<uint8_t> const buffer = Napi::Buffer<uint8_t>::New(env, lentBytes_);
                lent_ = Napi::Persistent(buffer);
                pump_->Lend(buffer.Data(), buffer.Length());
#endif
            }
            if (!TryFinishRead(env, deferred, &finished)) {
                // The producer has not filled the buffer yet, which is the
                // common case, since it only starts once the buffer is lent.
                // Pause, holding both the object and the event loop open until it
                // wakes us; the read above has already armed the callback that
                // will.
                paused = true;
            }
        }
        if (paused) {
            pending_ = deferred;
            finished = true;
            Ref();
            bridge_->signal->Ref(env);
        }
    } catch (...) {
        if (!paused) {
            // Nothing is lent: allocating, referencing and lending all fail
            // before the producer learns the address, and a finished read has
            // already had its memory handed back
            ReleaseLent();
        }
        if (!finished) {
            deferred.Reject(Napi::Error::New(env, "failed to start a read").Value());
        }
    }
    return deferred.Promise();
}

void EntryReader::OnProducerReady(Napi::Env env) {
    if (!closeWaiters_.empty()) {
        // close() resolved any paused read already, so the only thing left to wait for is the exit
        FinishClose(env);
        return;
    }
    if (!pending_.has_value()) {
        // close() resolved the read before the notification arrived. Nothing to
        // do; the producer is already unwinding.
        return;
    }
    Napi::Promise::Deferred const deferred = *pending_;
    bool finished = false;
    try {
        if (!TryFinishRead(env, deferred, &finished)) {
            return;
        }
    } catch (...) {
        pump_->Cancel();
        ReleaseLent();
        if (!finished) {
            try {
                // Created before the producer started: reporting a failed
                // allocation does not need another error-object allocation.
                deferred.Reject(readFailure_.Value());
            } catch (...) {  // NOLINT(bugprone-empty-catch)
                // Node can refuse JS operations during worker termination.
            }
        }
    }
    ReleasePending(env);
}

std::optional<uint64_t> EntryReader::Remaining() const {
    std::optional<uint64_t> const size = pump_->DeclaredSize();
    if (!size.has_value() || delivered_ > *size) {
        return std::nullopt;
    }
    return *size - delivered_;
}

void EntryReader::ReleaseLent() {
#ifdef __EMSCRIPTEN__
    scratch_.reset();
#else
    lent_.Reset();
#endif
}

void EntryReader::ReleasePending(Napi::Env env) {
    pending_.reset();
    bridge_->signal->Unref(env);

    // Last statement, and the last use of `this` on this path: it can drop the
    // final reference to the object
    Unref();
}

void EntryReader::FinishClose(Napi::Env env) {
    if (!bridge_->exited.load(std::memory_order_acquire)) {
        return;
    }
    // Copied out before the references are released, which may destroy `this`
    std::vector<Napi::Promise::Deferred> const waiters = std::exchange(closeWaiters_, {});
    bridge_->signal->Unref(env);
    Unref();
    for (const Napi::Promise::Deferred& waiter : waiters) {
        waiter.Resolve(env.Undefined());
    }
}

Napi::Value EntryReader::Close(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const closed = Napi::Promise::Deferred::New(env);

    // Whether `closed` is resolved, or will be by FinishClose(), so the catch-all below rejects it
    // only if neither
    bool finished = false;
    try {
        closed_ = true;
        if (pump_) {
            pump_->Cancel();
        }
        ReleaseLent();

        // Copied, then cleared: Napi::Promise::Deferred is trivially copyable,
        // so moving out of the optional would leave `pending_` engaged and this
        // promise reachable a second time
        std::optional<Napi::Promise::Deferred> const pending = pending_;
        pending_.reset();

        // Drops this side's reference to the producer without waiting for it. The
        // producer holds the other one and unwinds on its own time.
        pump_.reset();

        if (!bridge_ || bridge_->exited.load(std::memory_order_acquire)) {
            // Nothing was ever started, or the producer has already closed everything
            finished = true;
            closed.Resolve(env.Undefined());
        } else {
            closeWaiters_.push_back(closed);
            finished = true;
            if (closeWaiters_.size() == 1) {
                // Held until the producer's exit notification, so that neither the object nor the
                // signal that delivers it goes away first, and so that the loop stays alive for it
                Ref();
                bridge_->signal->Ref(env);
            }
        }

        if (pending.has_value()) {
            // The caller asked for the rest of the entry and then said it did
            // not want it: the end of the stream, not a failure. It has to be
            // resolved here rather than left to the producer, whose notification
            // now only reports its exit.
            pending->Resolve(env.Null());
            ReleasePending(env);
        }
    } catch (...) {
        if (!finished) {
            closed.Reject(Napi::Error::New(env, "failed to close the entry reader").Value());
        }
    }
    return closed.Promise();
}

}  // namespace sevenzip
