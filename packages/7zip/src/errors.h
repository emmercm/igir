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

// "(Is a directory)", or "(HRESULT 0x8000ffff)" when the code names nothing the
// operating system can describe. Only ever a suffix, never a sentence on its own.
std::string HResultSuffix(HRESULT hr);

// The message for a failing archive open. `hr` must not be S_OK; `path` and
// `formatIndex` name the archive so the message can say which file and which
// format failed.
std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex);

// The message for a failing entry lookup. `hr` must not be S_OK.
std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath);

// Explains a non-kOK extraction operation result. These distinguish an
// unsupported codec, a corrupt body, a truncated archive and an encrypted
// entry, which is the only part of a failure a user can act on. Phrased as a
// clause, to be appended after "failed to extract X from Y: ".
std::string OperationResultMessage(int32_t opResult);

}  // namespace sevenzip
