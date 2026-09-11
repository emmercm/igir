#include "../src/codecError.h"
#include "lizard/lizard_frame.h"
#include "zstdmt/lizard-mt.h"

#include <mutex>

namespace {

/** Converts a Lizard MT result into the most specific race-free diagnostic available from its public API. */
const char* LizardErrorMessage(size_t result) noexcept {
    switch (static_cast<LIZARDMT_ErrorCode>(0U - result)) {
        case LIZARDMT_error_memory_allocation:
            return "Lizard decoder could not allocate memory";
        case LIZARDMT_error_read_fail:
            return "Lizard decoder input callback failed or returned a short frame";
        case LIZARDMT_error_write_fail:
            return "Lizard decoder output callback failed";
        case LIZARDMT_error_data_error:
            return "Lizard decoder found malformed frame data";
        case LIZARDMT_error_frame_decompress:
            return "Lizard decoder could not decompress a complete frame";
        case LIZARDMT_error_compressionParameter_unsupported:
            return "Lizard decoder received an unsupported parameter";
        case LIZARDMT_error_compression_library:
            return LizardF_getErrorName(lizardmt_errcode);
        case LIZARDMT_error_canceled:
            return "Lizard decoding was cancelled";
        default:
            return "Lizard decoder reported an unknown error";
    }
}

/** Serializes Lizard calls that write the vendored library's process-global frame error code. */
std::mutex& LizardMutex() noexcept {
    static std::mutex mutex;
    return mutex;
}

/** Calls the vendored decoder while retaining its exact error for the addon's producer thread. */
size_t DecompressWithDiagnostics(LIZARDMT_DCtx* context, LIZARDMT_RdWr_t* callbacks) {
    std::scoped_lock const lock(LizardMutex());
    lizardmt_errcode = 0;
    size_t const result = LIZARDMT_decompressDCtx(context, callbacks);
    if (LIZARDMT_isError(result) != 0U) {
        sevenzip::SetCodecError(LizardErrorMessage(result));
    }
    return result;
}

}  // namespace

// Compile the unmodified upstream adapter through a local call-site shim. This
// retains the error value before upstream reduces every non-cancellation error
// to E_FAIL, without carrying a patched vendored submodule.
#define LIZARDMT_decompressDCtx DecompressWithDiagnostics
// NOLINTNEXTLINE(bugprone-suspicious-include)
#include "../deps/7-Zip-zstd/CPP/7zip/Compress/LizardDecoder.cpp"
#undef LIZARDMT_decompressDCtx
