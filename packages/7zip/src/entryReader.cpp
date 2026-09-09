#include "entryReader.h"

#include <cmath>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

#include "addon.h"
#include "chunkQueue.h"

namespace sevenzip {

Napi::Function EntryReader::GetClass(Napi::Env env) {
    return DefineClass(env, "EntryReader",
                       {
                           InstanceMethod("read", &EntryReader::Read),
                           InstanceMethod("close", &EntryReader::Close),
                       });
}

EntryReader::EntryReader(const Napi::CallbackInfo& info) : Napi::ObjectWrap<EntryReader>(info) {
    try {
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
            return;
        }
        std::optional<std::string> entryPath;
        if (named) {
            entryPath = info[2].As<Napi::String>().Utf8Value();
            if (entryPath->empty()) {
                // An empty path would otherwise be indistinguishable from naming no
                // entry at all, silently extracting a single-entry archive's member
                Napi::TypeError::New(env, "entry path must not be empty").ThrowAsJavaScriptException();
                return;
            }
        }
        // An out-of-range or non-integral hint is not an error: it cannot match
        // any item, and the Pump falls back to the scan
        std::optional<uint32_t> entryIndex;
        if (hinted) {
            double const requested = info[3].As<Napi::Number>().DoubleValue();
            if (requested >= 0 && requested <= UINT32_MAX && requested == std::floor(requested)) {
                entryIndex = static_cast<uint32_t>(requested);
            }
        }

        // Fixed for the life of the reader rather than passed to each read(),
        // because the producer fills chunks to this size before publishing them
        // and so must know it before any byte is decoded
        size_t chunkBytes = Pump::kReadAheadBytes;
        if (info.Length() >= 5 && info[4].IsNumber()) {
            double const requested = info[4].As<Napi::Number>().DoubleValue();
            if (!(requested >= 1)) {
                // Catches 0, negatives and NaN alike. A zero-byte chunk would
                // make every read return an empty buffer.
                Napi::TypeError::New(env, "chunkBytes must be at least 1").ThrowAsJavaScriptException();
                return;
            }
            chunkBytes = static_cast<size_t>(info[4].As<Napi::Number>().Uint32Value());
        }

        // The bridge exists before the producer does, because the producer
        // captures it. It is created unreferenced (the `false`), so holding a
        // reader open does not by itself keep the process alive; a parked read
        // re-references it for exactly as long as it is parked.
        auto bridge = std::make_shared<Bridge>();
        bridge->tsfn = TsfnHandle::Create(env, "sevenzip::EntryReader", false);
        if (!bridge->tsfn) {
            // N-API refused the function and has already left an error pending.
            // Nothing was started, so there is nothing to unwind; the
            // constructor's catch turns this into the reader's own message.
            throw std::runtime_error("could not create the entry reader's callback");
        }
        bridge->reader = this;

        std::shared_ptr<Pump> pump;
        try {
            pump = Pump::Start(
                info[0].As<Napi::String>().Utf8Value(), info[1].As<Napi::Number>().Uint32Value(), std::move(entryPath),
                entryIndex, chunkBytes, Registry(env),
                [bridge]() {
                    // Producer thread. Call() never blocks, and does nothing once
                    // the environment has gone away: there is no reader left to
                    // notify and no loop to notify it on.
                    bridge->tsfn->Call([bridge](Napi::Env env) {
                        // Event loop thread. Nothing may escape into N-API's C ABI.
                        try {
                            if (bridge->reader != nullptr) {
                                bridge->reader->OnProducerReady(env);
                            }
                        } catch (...) {  // NOLINT(bugprone-empty-catch)
                            // OnProducerReady handles its own failures; this only
                            // stops a failure in that handling from aborting
                        }
                    });
                },
                [bridge]() {
                    // Producer thread, exactly once, as its last act. This is the
                    // release matching the producer's use of the bridge, and the
                    // only thing that frees the ThreadSafeFunction.
                    bridge->tsfn->Release();
                });
        } catch (...) {
            // Nothing was started, so nothing will ever call onExit. Release
            // the ThreadSafeFunction's initial use count here, or it (and the
            // environment reference behind it) leaks.
            bridge->tsfn->Release();
            throw;
        }

        bridge_ = std::move(bridge);
        pump_ = std::move(pump);
        constructed_ = true;
    } catch (...) {
        // Reading the arguments allocates, creating the ThreadSafeFunction can
        // fail, and starting the Pump creates a std::thread, which throws
        // std::system_error when the OS refuses
        Napi::Error::New(info.Env(), "failed to open the entry for reading").ThrowAsJavaScriptException();
    }
}

EntryReader::~EntryReader() {
    if (bridge_) {
        // Both this and the callback that reads it run on the event loop
        // thread, so from here on the producer's notifications find no reader.
        // The ThreadSafeFunction stays alive inside the bridge until the
        // producer releases it.
        bridge_->reader = nullptr;
    }
    if (pump_) {
        pump_->Cancel();
    }
    // Drops this side's reference. If the producer is still running it holds the
    // other one and will finish unwinding on its own; nothing here waits.
    pump_.reset();
}

bool EntryReader::TrySettle(Napi::Env env, const Napi::Promise::Deferred& deferred, bool* settled) {
    Chunk chunk;
    ChunkQueue::Status status = ChunkQueue::Status::kEnd;
    try {
        status = pump_->TryRead(&chunk);
    } catch (const std::exception& e) {
        // The producer's own message, which names the archive, the entry and
        // what went wrong with it
        *settled = true;
        deferred.Reject(Napi::Error::New(env, e.what()).Value());
        return true;
    } catch (...) {
        *settled = true;
        deferred.Reject(Napi::Error::New(env, "unknown 7-Zip read error").Value());
        return true;
    }

    if (status == ChunkQueue::Status::kPending) {
        return false;
    }
    if (status == ChunkQueue::Status::kEnd) {
        *settled = true;
        deferred.Resolve(env.Null());
        return true;
    }

    // Hand the chunk's storage straight to JavaScript rather than copying it;
    // the finalizer frees it. `raw` is unowned between release() and a
    // successful New(), which is why the failure path below deletes it.
    uint8_t* raw = chunk.data.release();
    Napi::Buffer<uint8_t> const out = Napi::Buffer<uint8_t>::New(
        env, raw, chunk.length, [](Napi::Env /*unused*/, const uint8_t* data) { delete[] data; });
    *settled = true;
    if (out.IsEmpty()) {
        // With C++ exceptions disabled, a failed New() returns an empty value
        // and leaves a JS exception pending. Resolving with that empty value
        // would read as the end of the entry, so reject instead.
        delete[] raw;
        deferred.Reject(env.IsExceptionPending() ? env.GetAndClearPendingException().Value()
                                                 : Napi::Error::New(env, "failed to allocate the read result").Value());
    } else {
        deferred.Resolve(out);
    }
    return true;
}

Napi::Value EntryReader::Read(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    // A napi_deferred may be settled exactly once, and settling twice is
    // undefined behavior rather than an error, so the catch-all below has to
    // know whether the body already got there
    bool settled = false;
    try {
        if (closed_) {
            settled = true;
            deferred.Reject(Napi::Error::New(env, "read after close").Value());
        } else if (pending_.has_value()) {
            settled = true;
            deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        } else if (!constructed_ || !pump_) {
            // The constructor reported a TypeError and returned without starting
            // anything. Resolving with null here would tell a caller the entry
            // was empty, which is a different answer, and a silently wrong one.
            settled = true;
            deferred.Reject(Napi::Error::New(env, "the entry reader was never opened").Value());
        } else if (!TrySettle(env, deferred, &settled)) {
            // The producer has not caught up, which is the uncommon case, since
            // it runs ahead by a bounded amount. Park, holding both the object and
            // the event loop open until it wakes us; the read above has already
            // armed the callback that will.
            pending_ = deferred;
            settled = true;
            Ref();
            bridge_->tsfn->Ref(env);
        }
    } catch (...) {
        if (!settled) {
            deferred.Reject(Napi::Error::New(env, "failed to start a read").Value());
        }
    }
    return deferred.Promise();
}

void EntryReader::OnProducerReady(Napi::Env env) {
    if (!pending_.has_value()) {
        // close() settled the read before the notification arrived. Nothing to
        // do; the producer is already unwinding.
        return;
    }
    Napi::Promise::Deferred const deferred = *pending_;
    bool settled = false;
    if (!TrySettle(env, deferred, &settled)) {
        // Still nothing: the wake-up crossed with an abort. The read above
        // re-armed the callback, so stay parked.
        return;
    }
    ReleasePending(env);
}

void EntryReader::ReleasePending(Napi::Env env) {
    pending_.reset();
    bridge_->tsfn->Unref(env);
    // Last statement, and the last use of `this` on this path: it can drop the
    // final reference to the object
    Unref();
}

void EntryReader::Close(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    try {
        closed_ = true;
        if (pump_) {
            pump_->Cancel();
        }
        // Copied, then cleared: Napi::Promise::Deferred is trivially copyable,
        // so moving out of the optional would leave `pending_` engaged and this
        // promise reachable a second time
        std::optional<Napi::Promise::Deferred> const pending = pending_;
        pending_.reset();
        // Drops this side's reference to the producer without waiting for it. The
        // producer holds the other one and unwinds on its own time.
        pump_.reset();
        if (pending.has_value()) {
            // The caller asked for the rest of the entry and then said it did
            // not want it: the end of the stream, not a failure. It has to be
            // settled here rather than left to the producer, whose notification
            // we have just stopped listening for.
            pending->Resolve(env.Null());
            ReleasePending(env);
        }
    } catch (...) {
        Napi::Error::New(env, "failed to close the entry reader").ThrowAsJavaScriptException();
    }
}

}  // namespace sevenzip
