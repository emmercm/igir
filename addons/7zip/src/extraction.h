#pragma once

#include <atomic>

#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"
#include "outputSlot.h"

namespace sevenzip::detail {

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

// clang-format off: see above.
/**
 * Selects one item, supplies only its output stream, captures its result, and
 * checks cancellation during progress when a solid archive produces no output for a long time.
 */
// NOLINTNEXTLINE(misc-const-correctness,readability-inconsistent-ifelse-braces)
Z7_CLASS_IMP_COM_1(ExtractCallback, IArchiveExtractCallback)
    Z7_IFACE_COM7_IMP(IProgress)
   public:
    /** Stores the selected item and borrows the Pump's slot and cancellation flag. */
    ExtractCallback(UInt32 entryIndex, OutputSlot& slot, std::atomic<bool>& abort)
        : entryIndex_(entryIndex), slot_(slot), abort_(abort) {}

    /** Returns the extraction result most recently reported by 7-Zip. */
    [[nodiscard]] Int32 OpResult() const { return opResult_; }

   private:
    UInt32 entryIndex_;
    OutputSlot& slot_;
    std::atomic<bool>& abort_;
    Int32 opResult_ = NArchive::NExtract::NOperationResult::kOK;
};
// clang-format on

}  // namespace sevenzip::detail
