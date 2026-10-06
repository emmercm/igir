#include "pump.h"

#include <algorithm>
#include <new>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"
#include "errors.h"
#include "extraction.h"

namespace sevenzip {

Pump::Pump(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
           std::optional<uint32_t> entryIndex, std::function<void()> onReady)
    : path_(std::move(path)),
      formatIndex_(formatIndex),
      entryPath_(std::move(entryPath)),
      entryIndex_(entryIndex),
      slot_(std::move(onReady)) {}

std::shared_ptr<Pump> Pump::Create(std::string path, uint32_t formatIndex, std::optional<std::string> entryPath,
                                   std::optional<uint32_t> entryIndex, std::shared_ptr<JobRegistry> registry,
                                   std::function<void()> onReady, std::function<void()> onExit) {
    // `onReady` goes through the constructor because OutputSlot holds it as a
    // const member
    std::shared_ptr<Pump> pump(
        new Pump(std::move(path), formatIndex, std::move(entryPath), entryIndex, std::move(onReady)));
    pump->onExit_ = std::move(onExit);
    pump->registry_ = std::move(registry);
    if (!pump->registry_) {
        // Only reachable once the environment's instance data is gone, which
        // is teardown. Treated like the refused registration below rather than
        // as license to run unregistered.
        throw std::runtime_error("the 7-Zip addon is shutting down");
    }

    // Registered before anything runs, so there is no window in which an open
    // or a running producer is invisible to teardown. The callback captures
    // weakly because teardown may reach for it after this Pump's last reference
    // has been dropped; locking a dead weak_ptr is then a no-op.
    std::weak_ptr<Pump> const weak = pump;
    pump->token_ = pump->registry_->Register([weak]() noexcept {
        if (std::shared_ptr<Pump> const alive = weak.lock()) {
            alive->Cancel();
        }
    });
    if (pump->token_ == JobRegistry::kInvalidToken) {
        // The environment is tearing down. Opening now would leave work
        // nothing is waiting for.
        throw std::runtime_error("the 7-Zip addon is shutting down");
    }
    return pump;
}

void Pump::Run(std::shared_ptr<Pump> pump) noexcept {
    bool ready = false;
    try {
        ready = pump->Open();
    } catch (...) {
        pump->SetCurrentError();
    }

    if (ready) {
        // The producer holds a strong reference for as long as it runs, so the
        // consumer can drop its own at any moment without waiting for the
        // decoder to notice. If the last reference is this one, ~Pump runs on
        // the producer thread after it finishes, touching only members no one
        // else can reach.
        try {
            std::thread([pump]() mutable {
                try {
                    pump->Extract();
                } catch (...) {
                    pump->SetCurrentError();
                }
                pump->Finish();
                Exit(std::move(pump));
            }).detach();
            return;
        } catch (...) {
            // std::thread throws std::system_error when the OS refuses. The
            // thread's copy of `pump` is gone, and this one ends the pump below.
            try {
                pump->SetError("failed to start extracting " + pump->EntryLabel() + " from '" + pump->path_ + "'");
            } catch (...) {  // NOLINT(bugprone-empty-catch)
            }
        }
    }

    // Nothing to extract: the open failed or was cancelled. The archive, if it
    // was opened, closes here on this pool thread.
    pump->Finish();
    Exit(std::move(pump));
}

void Pump::Abandon(std::shared_ptr<Pump> pump) noexcept {
    try {
        pump->SetError("the archive was never opened");
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
    pump->Finish();
    Exit(std::move(pump));
}

void Pump::Exit(std::shared_ptr<Pump> pump) noexcept {
    try {
        pump->onExit_();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Documented as non-throwing, and the only caller passes
        // AsyncSignal::Release(), which is noexcept, but nothing enforces that
        // on other callers, and an exception escaping a std::thread's callable
        // calls std::terminate().
    }

    // Copied out before the reference is dropped, because dropping it may be
    // what destroys the Pump they are read from
    std::shared_ptr<JobRegistry> const registry = pump->registry_;
    JobRegistry::Token const token = pump->token_;

    // Released before unregistering, not after. When this is the last
    // reference, ~Pump runs here and destroys the OutputSlot, whose ready
    // callback holds an AsyncSignal. Letting the shared_ptr fall out of scope
    // on its own would order that after the Unregister() below, which teardown
    // reads as "the pump is done" before those objects are actually gone.
    pump.reset();

    // Dead last, after everything else this thread will ever touch
    if (registry) {
        registry->Unregister(token);
    }
}

void Pump::Finish() noexcept {
    // Closed before the slot finishes, so that every file handle is released
    // before the consumer learns the entry has ended
    opened_.archive.Release();
    opened_.stream.Release();
    try {
        // Always signal completion, on every path, so a waiting consumer cannot
        // hang, including when the error reporting failed
        slot_.Finish();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
}

void Pump::SetCurrentError() noexcept {
    try {
        try {
            throw;
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            // Several vendored calls throw non-std exceptions by design, and
            // archives are untrusted input
            SetError("unknown 7-Zip error");
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // The handlers above allocate a std::string and lock a mutex, so they
        // can throw in turn. Escaping a thread's entry point, or the noexcept
        // Run(), would call std::terminate().
    }
}

void Pump::Cancel() noexcept {
    abort_.store(true, std::memory_order_relaxed);
    slot_.Abort();
}

void Pump::Lend(uint8_t* data, size_t capacity) { slot_.Lend(data, capacity); }

void Pump::SetError(std::string message) {
    std::scoped_lock const lock(errorMutex_);
    if (error_.empty()) {
        error_ = std::move(message);
    }
}

std::string Pump::EntryLabel() const {
    if (entryPath_.has_value()) {
        return "the entry '" + *entryPath_ + "'";
    }
    return "the only entry";
}

std::string Pump::OutputFailureMessage() const {
    return "failed to pass the output of " + EntryLabel() + " from '" + path_ + "' to the reader";
}

HRESULT Pump::ResolveEntryIndex(IInArchive& archive, uint32_t* out) {
    if (entryPath_.has_value()) {
        // A remembered index is verified, never trusted: one kpidPath read
        // says whether the archive still holds that entry there, and skips the
        // scan below when it does. When it does not, the archive was rewritten
        // since the index was recorded and the scan is the right answer.
        if (entryIndex_.has_value() && EntryIndexMatches(archive, *entryIndex_, NormalizeEntryPath(*entryPath_))) {
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
        SetError("could not read the archive's item count; it is likely corrupt" + HResultSuffix(hr));
        return hr;
    }
    if (count != 1) {
        SetError("no entry was named, and the archive holds " + std::to_string(count) + " entries rather than one");
        return E_INVALIDARG;
    }
    *out = 0;
    return S_OK;
}

bool Pump::Open() {
    // Passing abort_ makes the open itself interruptible. A large solid .7z
    // decodes its header here, which is long enough that a close() during it
    // would otherwise go unobserved until the whole header had been read.
    HRESULT const hr = OpenArchive(path_, formatIndex_, &opened_, &abort_);
    if (hr != S_OK) {
        if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
            return false;  // the consumer closed during the open; not an error
        }
        SetError(OpenErrorMessage(hr, path_, formatIndex_));
        return false;
    }

    // ResolveEntryIndex() reports why when it fails
    return ResolveEntryIndex(*opened_.archive, &resolvedIndex_) == S_OK && !abort_.load(std::memory_order_relaxed);
}

void Pump::Extract() {
    // Taken over from Open() so that everything 7-Zip owns is destroyed, and
    // every file handle closed, before this thread finishes the slot
    OpenedArchive opened;
    opened.archive.Attach(opened_.archive.Detach());
    opened.stream.Attach(opened_.stream.Detach());
    uint32_t const index = resolvedIndex_;

    // Held through the interface pointer because the class macro makes
    // AddRef()/Release() private on the concrete class; `raw` stays valid for
    // OpResult() because `callback` owns a reference
    auto* raw = new detail::ExtractCallback(index, slot_, abort_);
    CMyComPtr<IArchiveExtractCallback> const callback(raw);
    HRESULT const hr = opened.archive->Extract(&index, 1, 0 /* testMode */, callback);
    if (slot_.Failed()) {
        // Checked first, whatever Extract() returned: a handler may translate
        // the sink's E_FAIL into an operation result, or into S_OK for a codec
        // that reads a short write as the end of its output. Reporting that as
        // success would hand the caller a truncated entry.
        SetError(OutputFailureMessage());
    } else if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
        // The consumer closed early; not an error
    } else if (hr != S_OK) {
        SetError("failed to extract " + EntryLabel() + " from '" + path_ + "'" + HResultSuffix(hr));
    } else if (raw->OpResult() != NArchive::NExtract::NOperationResult::kOK) {
        SetError("failed to extract " + EntryLabel() + " from '" + path_ +
                 "': " + OperationResultMessage(raw->OpResult()));
    }
}

OutputSlot::Status Pump::TryRead(size_t* length) {
    OutputSlot::Status const status = slot_.TryTake(length);
    if (status == OutputSlot::Status::kEnd) {
        // Only at the end, and only once there is nothing left to hand over: a
        // failure part-way through an entry still delivers the bytes that were
        // decoded before it
        std::scoped_lock const lock(errorMutex_);
        if (error_.empty() && slot_.Failed()) {
            // Extract() records the same message, but only once it has
            // unwound, and the slot stops handing out buffers the instant the
            // write fails, so the consumer routinely gets here first. In that
            // window `error_` is still empty and the end of the output would be
            // indistinguishable from a complete entry.
            error_ = OutputFailureMessage();
        }
        if (!error_.empty()) {
            throw std::runtime_error(error_);
        }
    }
    return status;
}

}  // namespace sevenzip
