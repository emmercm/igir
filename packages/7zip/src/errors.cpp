#include "errors.h"

#include <string>
#include <string_view>
#include <system_error>

#include "7zip/Archive/IArchive.h"
#include "sevenZip.h"

namespace sevenzip {

std::string HResultSuffix(HRESULT hr) {
    const auto value = static_cast<unsigned>(hr);
    if ((value & 0xffff0000U) == kSystemFacility) {
        // The low half is an operating system error code, so the platform can
        // name it: "Is a directory" beats "HRESULT 0x88000015".
        //
        // std::system_category() rather than std::strerror(): it matches
        // kSystemFacility on both platforms, and strerror may return a pointer
        // into a shared static buffer that several threads can be in at once.
        return " (" + std::system_category().message(static_cast<int>(value & 0xffffU)) + ")";
    }
    // Formatted by hand rather than with snprintf, which would need a C array
    // and a vararg call, or std::format, which not every toolchain this addon
    // is prebuilt on provides yet
    static constexpr std::string_view kHexDigits = "0123456789abcdef";
    std::string out = " (HRESULT 0x";
    for (int shift = 28; shift >= 0; shift -= 4) {
        out += kHexDigits[(value >> shift) & 0xfU];
    }
    out += ")";
    return out;
}

std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex) {
    const std::string where = "'" + path + "'";
    const std::string format = FormatLabel(formatIndex);
    if (hr == kVolumeOpenFailed) {
        return "could not read " + where + " (the file may be missing, unreadable, or a directory)";
    }
    if (hr == S_FALSE) {
        // The most common failure: the handler read the file and decided it is
        // not one of these. Truncated, corrupt, and wrong-format archives all
        // land here with no way to tell them apart, so say what is actually
        // known rather than printing S_FALSE as if it were an error code.
        return where + " is not a valid " + format + " archive (it may be corrupt, truncated, or a different format)";
    }
    if (hr == E_INVALIDARG) {
        return "cannot open " + where + " as " + format + ": the path or format is invalid";
    }
    if (hr == E_OUTOFMEMORY) {
        return "ran out of memory opening " + where + " as " + format;
    }
    return "failed to open " + where + " as " + format + HResultSuffix(hr);
}

std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath) {
    if (hr == kEntryNotFound) {
        return "the archive has no entry named '" + entryPath + "'";
    }
    return "failed to look up the entry '" + entryPath + "' in the archive" + HResultSuffix(hr);
}

std::string OperationResultMessage(int32_t opResult) {
    using namespace NArchive::NExtract::NOperationResult;  // NOLINT(google-build-using-namespace)
    switch (opResult) {
        case kUnsupportedMethod:
            return "its compression method is not supported by this build";
        case kDataError:
            return "its compressed data is corrupt";
        case kCRCError:
            return "it failed its CRC check, so the archive is corrupt";
        case kUnavailable:
            return "the entry is unavailable";
        case kUnexpectedEnd:
            return "the archive ends before the entry does, so it is truncated";
        case kDataAfterEnd:
            return "there is unexpected data after the end of the archive";
        case kIsNotArc:
            return "the entry is not an archive";
        case kHeadersError:
            return "its headers are corrupt";
        case kWrongPassword:
            return "it is encrypted, and encrypted entries are not supported";
        default:
            return "it could not be decoded";
    }
}

}  // namespace sevenzip
