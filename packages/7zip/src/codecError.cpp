#include "codecError.h"

#include <algorithm>
#include <array>

namespace sevenzip {
namespace {

/** Returns bounded diagnostic storage private to the current producer thread. */
std::array<char, 192>& CodecErrorBuffer() noexcept {
    // The decoder and Pump::Extract run on the same producer thread. A fixed-
    // size buffer preserves that relationship without allocation, locks, or
    // the data race in the vendored libraries' process-global error variables.
    static thread_local std::array<char, 192> codecError{};
    return codecError;
}

}  // namespace

void ClearCodecError() noexcept { CodecErrorBuffer().front() = '\0'; }

void SetCodecError(std::string_view message) noexcept {
    auto& codecError = CodecErrorBuffer();
    size_t length = 0;
    length = std::min(message.size(), codecError.size() - 1);
    // The explicit count is the bounded length above; no terminator is read.
    // NOLINTNEXTLINE(bugprone-suspicious-stringview-data-usage)
    std::copy_n(message.data(), length, codecError.data());
    codecError[length] = '\0';
}

std::string TakeCodecError() {
    auto& codecError = CodecErrorBuffer();
    std::string const message(codecError.data());
    ClearCodecError();
    return message;
}

}  // namespace sevenzip
