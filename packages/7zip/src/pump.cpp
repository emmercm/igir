#include <algorithm>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include "pump.h"
#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"
#include "errors.h"

namespace sevenzip {

namespace {

// Both callback classes below are declared with upstream's own class macro, so
// the base list, QueryInterface/AddRef/Release, and every method signature come
// from the vendored headers instead of being transcribed here. A signature
// change in a future 7-Zip drop then becomes a compile error rather than
// something to spot by eye. See deps/7zip/CPP/Common/MyCom.h and the same idiom
// in deps/7zip/CPP/7zip/UI/Common/ArchiveExtractCallback.cpp.
//
// The addon is built with Z7_ST (see binding.gyp), which makes the macro-supplied
// Z7_COM_ADDREF_RELEASE a plain non-atomic ++/-- (MyCom.h:379-385). That is safe
// only because every reference to these objects is created, copied and released
// on the producer thread alone. Dropping Z7_ST -- or handing one of these objects
// to another thread -- would introduce a reference-count race.

// The sink 7-Zip writes decompressed bytes into. Every Write() blocks while the
// queue is full, which is what keeps memory bounded; it returns E_ABORT once the
// consumer has closed, which unwinds Extract() promptly. This thread is the only
// one in the process that is ever allowed to block on the consumer.
Z7_CLASS_IMP_COM_1(QueueOutStream, ISequentialOutStream)
   public:
    QueueOutStream(ChunkQueue& queue, std::atomic<bool>& abort) : queue_(queue), abort_(abort) {}

   private:
    ChunkQueue& queue_;
    std::atomic<bool>& abort_;
};

// Extraction driver. GetStream() hands 7-Zip the sink for the one entry we want
// and nullptr for anything else. SetCompleted() is the second abort check: for a
// solid 7z folder whose target entry is last, no Write() happens for a long
// time, so without this an abort would not be observed until decoding finished.
Z7_CLASS_IMP_COM_1(ExtractCallback, IArchiveExtractCallback)
    Z7_IFACE_COM7_IMP(IProgress)
   public:
    ExtractCallback(UInt32 entryIndex, ChunkQueue& queue, std::atomic<bool>& abort)
        : entryIndex_(entryIndex), queue_(queue), abort_(abort) {}

    Int32 OpResult() const { return opResult_; }

   private:
    UInt32 entryIndex_;
    ChunkQueue& queue_;
    std::atomic<bool>& abort_;
    Int32 opResult_ = NArchive::NExtract::NOperationResult::kOK;
};

Z7_COM7F_IMF(QueueOutStream::Write(const void* data, UInt32 size, UInt32* processedSize)) {
    if (processedSize != nullptr) {
        *processedSize = 0;
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    if (!queue_.Write(static_cast<const uint8_t*>(data), size)) {
        return E_ABORT;
    }
    if (processedSize != nullptr) {
        *processedSize = size;
    }
    return S_OK;
}

// IProgress
Z7_COM7F_IMF(ExtractCallback::SetTotal(UInt64 /*total*/)) { return S_OK; }

Z7_COM7F_IMF(ExtractCallback::SetCompleted(const UInt64* /*completeValue*/)) {
    return abort_.load(std::memory_order_relaxed) ? E_ABORT : S_OK;
}

// IArchiveExtractCallback
Z7_COM7F_IMF(ExtractCallback::GetStream(UInt32 index, ISequentialOutStream** outStream,
                                        Int32 askExtractMode)) {
    *outStream = nullptr;
    if (askExtractMode != NArchive::NExtract::NAskMode::kExtract || index != entryIndex_) {
        return S_OK;  // skip: 7-Zip decodes past it without materializing bytes
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    CMyComPtr<ISequentialOutStream> sink(new QueueOutStream(queue_, abort_));
    *outStream = sink.Detach();
    return S_OK;
}

Z7_COM7F_IMF(ExtractCallback::PrepareOperation(Int32 /*askExtractMode*/)) { return S_OK; }

Z7_COM7F_IMF(ExtractCallback::SetOperationResult(Int32 opRes)) {
    opResult_ = opRes;
    return S_OK;
}

// How many chunks may sit queued, for a given chunk size. See kReadAheadBytes.
size_t ReadAheadChunks(size_t chunkBytes) {
    return std::max<size_t>(2, (Pump::kReadAheadBytes + chunkBytes - 1) / chunkBytes);
}

}  // namespace

Pump::Pump(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
           std::optional<uint32_t> entryIndex, size_t chunkBytes, std::function<void()> onReady)
    : path_(std::move(path)),
      formatIndex_(formatIndex),
      entryPath_(std::move(entryPath)),
      entryIndex_(entryIndex),
      queue_(chunkBytes, ReadAheadChunks(chunkBytes), std::move(onReady)) {}

std::shared_ptr<Pump> Pump::Start(std::string path, uint32_t formatIndex,
                                  std::optional<std::string> entryPath,
                                  std::optional<uint32_t> entryIndex, size_t chunkBytes,
                                  std::shared_ptr<JobRegistry> registry,
                                  std::function<void()> onReady, std::function<void()> onExit) {
    chunkBytes = std::clamp<size_t>(chunkBytes, 1, kMaxChunkBytes);
    // `onReady` goes through the constructor because ChunkQueue holds it as a
    // const member: it is read outside the lock on every publishing path, which
    // is sound only because nothing can reassign it once the producer is running.
    std::shared_ptr<Pump> pump(new Pump(std::move(path), formatIndex, std::move(entryPath),
                                        entryIndex, chunkBytes, std::move(onReady)));
    pump->onExit_ = std::move(onExit);
    pump->registry_ = std::move(registry);

    // Registered BEFORE the thread starts, so there is no window in which a
    // running producer is invisible to teardown. The callback captures weakly:
    // teardown may reach for it at any moment, including after this Pump's last
    // reference has been dropped, and locking a dead weak_ptr is the no-op that
    // makes that safe (see JobRegistry::Register).
    if (pump->registry_) {
        std::weak_ptr<Pump> const weak = pump;
        pump->token_ = pump->registry_->Register([weak]() noexcept {
            if (std::shared_ptr<Pump> const alive = weak.lock()) {
                alive->Cancel();
            }
        });
        if (pump->token_ == JobRegistry::kInvalidToken) {
            // The environment is tearing down. Starting now would leave a thread
            // nothing is waiting for, which is the exact failure this registry
            // exists to prevent.
            throw std::runtime_error("the 7-Zip addon is shutting down");
        }
    }

    // The producer holds a strong reference for exactly as long as it runs, so
    // the consumer is free to drop its own at any moment -- which is the point:
    // teardown never waits for a decoder to notice it should stop. If the last
    // reference is this one, ~Pump runs on the producer thread after Run() has
    // returned, touching only members no one else can still reach.
    //
    // If std::thread's constructor throws, the registration above is undone and
    // `pump` is destroyed here, so nothing was started; Start() propagates and
    // the caller has no Pump. onExit is therefore NOT called on that path, which
    // is why the caller allocates its side of the bridge only after Start()
    // returns. Undoing the registration matters as much as not calling onExit:
    // a token left behind is a thread teardown would wait forever for.
    try {
        std::thread([pump]() {
            pump->Run();
            try {
                pump->onExit_();
            } catch (...) {  // NOLINT(bugprone-empty-catch)
                // Documented as non-throwing, and today it is only a
                // ThreadSafeFunction::Release() that returns a status rather
                // than throwing -- but nothing enforces that, and an exception
                // escaping a std::thread's callable calls std::terminate().
                // Run() guards itself the same way; this is the one step
                // outside it.
            }
            // Dead last, after onExit_ and after everything else this thread
            // will ever touch. Teardown treats this as "the thread is done" and
            // is then free to let the environment finish going away, so any
            // work ordered after it could run against freed state.
            if (pump->registry_) {
                pump->registry_->Unregister(pump->token_);
            }
        }).detach();
    } catch (...) {
        if (pump->registry_) {
            pump->registry_->Unregister(pump->token_);
        }
        throw;
    }
    return pump;
}

void Pump::Cancel() noexcept {
    abort_.store(true, std::memory_order_relaxed);
    queue_.Abort();
}

void Pump::SetError(std::string message) {
    std::lock_guard<std::mutex> const lock(errorMutex_);
    if (error_.empty()) {
        error_ = std::move(message);
    }
}

// Describes the entry for an error message, however the caller named it.
std::string Pump::EntryLabel() const {
    if (entryPath_.has_value()) {
        return "the entry '" + *entryPath_ + "'";
    }
    return "the only entry";
}

HRESULT Pump::ResolveEntryIndex(IInArchive& archive, uint32_t* out) {
    if (entryPath_.has_value()) {
        // A remembered index is verified, never trusted: one kpidPath read says
        // whether the archive still holds that entry there. When it does, the
        // scan below -- a property read per item -- is skipped entirely. When it
        // does not, the archive was rewritten since the index was recorded, and
        // the scan is exactly the right answer.
        if (entryIndex_.has_value() &&
            EntryIndexMatches(archive, *entryIndex_, NormalizeEntryPath(*entryPath_))) {
            *out = *entryIndex_;
            return S_OK;
        }

        uint32_t found = 0;
        HRESULT const hr = FindEntryIndex(archive, *entryPath_, &found);
        if (hr != S_OK) {
            SetError(FindEntryErrorMessage(hr, *entryPath_));
            return hr;
        }
        *out = found;
        return S_OK;
    }

    // No path: the caller means the archive's only entry. Anything else is
    // ambiguous, and picking one silently is how the wrong bytes get extracted.
    UInt32 count = 0;
    HRESULT const hr = archive.GetNumberOfItems(&count);
    if (hr != S_OK) {
        SetError("could not read the archive's item count; it is likely corrupt" +
                 HResultSuffix(hr));
        return hr;
    }
    if (count != 1) {
        SetError("no entry was named, and the archive holds " + std::to_string(count) +
                 " entries rather than one");
        return E_INVALIDARG;
    }
    *out = 0;
    return S_OK;
}

void Pump::Extract() {
    // Everything 7-Zip owns lives inside this scope so that it is destroyed --
    // and every file handle closed -- before the thread exits.
    OpenedArchive opened;
    // Passing abort_ makes the open itself interruptible. A large solid .7z
    // decodes its header here, so a close() during that phase used to go
    // unobserved until the whole header had been read.
    HRESULT hr = OpenArchive(path_, formatIndex_, &opened, &abort_);
    if (hr != S_OK) {
        if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
            return;  // the consumer closed during the open; not an error
        }
        SetError(OpenErrorMessage(hr, path_, formatIndex_));
        return;
    }

    uint32_t index = 0;
    hr = ResolveEntryIndex(*opened.archive, &index);
    if (hr != S_OK) {
        return;  // ResolveEntryIndex() already reported why
    }

    // Held through the interface pointer because the class macro makes
    // AddRef()/Release() private on the concrete class; `raw` stays valid for
    // OpResult() because `callback` owns a reference.
    auto* raw = new ExtractCallback(index, queue_, abort_);
    CMyComPtr<IArchiveExtractCallback> const callback(raw);
    hr = opened.archive->Extract(&index, 1, 0 /* testMode */, callback);
    if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
        // The consumer closed early; not an error.
    } else if (hr != S_OK) {
        SetError("failed to extract " + EntryLabel() + " from '" + path_ + "'" +
                 HResultSuffix(hr));
    } else if (raw->OpResult() != NArchive::NExtract::NOperationResult::kOK) {
        SetError("failed to extract " + EntryLabel() + " from '" + path_ +
                 "': " + OperationResultMessage(raw->OpResult()));
    }
}

void Pump::Run() {
    try {
        try {
            Extract();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown 7-Zip error");
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // The handlers above allocate a std::string and lock a mutex, so they
        // can throw in turn. There is no way left to report that, and escaping
        // this thread's entry point would call std::terminate().
    }
    try {
        // Always signal completion, on every path, so a waiting consumer cannot
        // hang -- including when the error reporting above failed.
        queue_.Finish();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
}

ChunkQueue::Status Pump::TryRead(Chunk* out) {
    ChunkQueue::Status const status = queue_.TryTake(out);
    if (status == ChunkQueue::Status::kEnd) {
        // Only at the end, and only once there is nothing left to hand over: a
        // failure part-way through an entry still delivers the bytes that were
        // decoded before it.
        std::lock_guard<std::mutex> const lock(errorMutex_);
        if (!error_.empty()) {
            throw std::runtime_error(error_);
        }
    }
    return status;
}

}  // namespace sevenzip
