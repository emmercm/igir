#include "../src/codecError.h"
#include "zstdmt/lz5-mt.h"

namespace {

/** Converts an LZ5 MT result into the most specific race-free diagnostic available from its public API. */
const char* Lz5ErrorMessage(size_t result) noexcept {
    switch (static_cast<LZ5MT_ErrorCode>(0U - result)) {
        case LZ5MT_error_memory_allocation:
            return "LZ5 decoder could not allocate memory";
        case LZ5MT_error_read_fail:
            return "LZ5 decoder input callback failed or returned a short frame";
        case LZ5MT_error_write_fail:
            return "LZ5 decoder output callback failed";
        case LZ5MT_error_data_error:
            return "LZ5 decoder found malformed frame data";
        case LZ5MT_error_frame_decompress:
            return "LZ5 decoder could not decompress a complete frame";
        case LZ5MT_error_compressionParameter_unsupported:
            return "LZ5 decoder received an unsupported parameter";
        case LZ5MT_error_compression_library:
            return "LZ5 frame decoder reported an error (frame header, size, compressed data, or checksum)";
        case LZ5MT_error_canceled:
            return "LZ5 decoding was cancelled";
        default:
            return "LZ5 decoder reported an unknown error";
    }
}

/** Calls the vendored decoder while retaining its MT error category for the addon's producer thread. */
size_t DecompressWithDiagnostics(LZ5MT_DCtx* context, LZ5MT_RdWr_t* callbacks) {
    size_t const result = LZ5MT_decompressDCtx(context, callbacks);
    if (LZ5MT_isError(result) != 0U) {
        sevenzip::SetCodecError(Lz5ErrorMessage(result));
    }
    return result;
}

}  // namespace

// Compile the unmodified upstream adapter through a local call-site shim. This
// retains the error value before upstream reduces every non-cancellation error
// to E_FAIL, without carrying a patched vendored submodule.
#define LZ5MT_decompressDCtx DecompressWithDiagnostics
// NOLINTNEXTLINE(bugprone-suspicious-include)
#include "../deps/7-Zip-zstd/CPP/7zip/Compress/Lz5Decoder.cpp"
#undef LZ5MT_decompressDCtx
