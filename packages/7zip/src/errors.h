#pragma once

#include <cstdint>
#include <string>

#include "Common/MyWindows.h"

// Turns 7-Zip's result codes into the sentences the addon fails with
namespace sevenzip {

// The high half of an HRESULT that 7-Zip built out of an operating system error
// code: a code with these bits set carries that error in its low half, in the
// domain std::system_category() speaks on this platform.
//
// The two platforms disagree on what that means, and matching only one of them
// silently costs every message on the other. 7-Zip's POSIX shim invents a
// facility of its own (HRESULT_FROM_ERRNO in C/7zTypes.h is
// 0x80000000 | (0x800 << 16) | errno), while its Windows builds use the real
// HRESULT_FROM_WIN32, which is facility 7 over a Win32 error. std::system_category()
// is errno on POSIX and the Win32 error domain on MSVC, so each half of this is
// exactly the low word its own platform's category can name.
#ifdef _WIN32
constexpr unsigned kSystemFacility = 0x80070000U;
#else
constexpr unsigned kSystemFacility = 0x88000000U;
#endif

/** Formats an OS description such as `(Is a directory)`, or a hexadecimal HRESULT, strictly as a suffix. */
std::string HResultSuffix(HRESULT hr);

/** Converts a non-success archive-open result into a user-facing message naming its path and format. */
std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex);

/** Converts a non-success item lookup into a message naming the requested entry. */
std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath);

/**
 * Converts a non-kOK extraction result into an actionable clause distinguishing
 * unsupported codecs, corruption, truncation, and encryption for appending to a failure message.
 */
std::string OperationResultMessage(int32_t opResult);

}  // namespace sevenzip
