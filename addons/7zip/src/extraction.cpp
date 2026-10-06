#include "extraction.h"

#include <new>

namespace sevenzip::detail {

// Z7_COM7F_IMF and friends expand to 7-Zip's own `throw()` specification on
// every COM method below. It comes from the vendored interface declarations
// these definitions have to match, so none of them can be respelled `noexcept`
// from here.
// NOLINTBEGIN(modernize-use-noexcept)

namespace {

// Both callback classes below are declared with upstream's own class macro, so
// their base list, QueryInterface/AddRef/Release, and method signatures come
// from the vendored headers. A signature change in a future 7-Zip drop is then
// a compile error rather than something to spot by eye.
//
// The addon is built single-threaded, so the macro-supplied AddRef and Release
// are non-atomic ++/--. That is safe only because every reference to these
// objects is created, copied and released on the producer thread alone. The
// archive itself is opened on a pool thread and handed to the producer thread,
// but only once the pool thread is done with it, so its references are never
// touched from two threads at once either.

// clang-format off: the macro opens a class body clang-format cannot see, so it
// reads everything below as file scope and unindents it. The NOLINT is about
// the code the macro generates, not about anything written here.
/**
 * Adapts 7-Zip's push output to the output slot, blocking only the producer
 * while no buffer is lent and returning E_ABORT after the consumer closes.
 */
// NOLINTNEXTLINE(misc-const-correctness,readability-inconsistent-ifelse-braces)
Z7_CLASS_IMP_COM_1(SlotOutStream, ISequentialOutStream)
   public:
    /** Borrows slot and cancellation state owned by the Pump driving extraction. */
    SlotOutStream(OutputSlot& slot, std::atomic<bool>& abort) : slot_(slot), abort_(abort) {}

   private:
    OutputSlot& slot_;
    std::atomic<bool>& abort_;
};
// clang-format on

/** Copies decoder output into lent buffers and maps cancellation or failure to HRESULT. */
Z7_COM7F_IMF(SlotOutStream::Write(const void* data, UInt32 size, UInt32* processedSize)) {
    if (processedSize != nullptr) {
        *processedSize = 0;
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    if (!slot_.Write(static_cast<const uint8_t*>(data), size)) {
        // The consumer closing is a normal end of stream, but a failed write
        // has to reach the caller as an error rather than as an entry that
        // quietly stopped early
        return slot_.Failed() ? E_FAIL : E_ABORT;
    }
    if (processedSize != nullptr) {
        *processedSize = size;
    }
    return S_OK;
}

}  // namespace

// IProgress
/** Accepts 7-Zip's total-progress announcement; the pull API does not expose it. */
Z7_COM7F_IMF(ExtractCallback::SetTotal(UInt64 /*total*/)) { return S_OK; }

/** Interrupts extraction at 7-Zip progress points when the consumer has cancelled. */
Z7_COM7F_IMF(ExtractCallback::SetCompleted(const UInt64* /*completeValue*/)) {
    return abort_.load(std::memory_order_relaxed) ? E_ABORT : S_OK;
}

// IArchiveExtractCallback
/** Supplies a slot-backed stream only for the selected item in extraction mode. */
Z7_COM7F_IMF(ExtractCallback::GetStream(UInt32 index, ISequentialOutStream** outStream, Int32 askExtractMode)) {
    *outStream = nullptr;
    if (askExtractMode != NArchive::NExtract::NAskMode::kExtract || index != entryIndex_) {
        return S_OK;  // skip: 7-Zip decodes past it without materializing bytes
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    // Nothrow: this function carries 7-Zip's `throw()` specification, so an
    // escaping std::bad_alloc would call std::terminate() rather than surface
    // as a failed extraction
    auto* stream = new (std::nothrow) SlotOutStream(slot_, abort_);
    if (stream == nullptr) {
        return E_OUTOFMEMORY;
    }
    CMyComPtr<ISequentialOutStream> sink(stream);
    *outStream = sink.Detach();
    return S_OK;
}

/** Accepts 7-Zip's operation-preparation notification without additional state. */
Z7_COM7F_IMF(ExtractCallback::PrepareOperation(Int32 /*askExtractMode*/)) { return S_OK; }

/** Stores the selected item's final operation result for Pump error translation. */
Z7_COM7F_IMF(ExtractCallback::SetOperationResult(Int32 opRes)) {
    opResult_ = opRes;
    return S_OK;
}

// NOLINTEND(modernize-use-noexcept)

}  // namespace sevenzip::detail
