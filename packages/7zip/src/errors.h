#pragma once

#include <cstdint>
#include <string>

#include "Common/MyWindows.h"

// Every string this addon fails with, kept together so that one failure always
// gets one sentence. Pure functions from a result code to a message.
namespace sevenzip {

// The high half of an HRESULT that 7-Zip built out of an errno value: a code
// with these bits set carries the errno in its low half.
constexpr unsigned kErrnoFacility = 0x88000000U;

// "(Is a directory)", or "(HRESULT 0x8007000e)" when the code names nothing the
// C library can describe. Only ever a suffix, never a sentence on its own.
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
