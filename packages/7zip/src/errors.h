#pragma once

#include <cstdint>
#include <string>

#include "Common/MyWindows.h"

// Every string this addon fails with. They live together, away from the code
// that produces them, because their only real requirement is consistency: a
// user who sees two different sentences for the same failure has learned
// nothing, and that is much easier to check when the sentences sit next to each
// other than when they are scattered across the layer that raised them.
//
// Nothing here includes <napi.h> or drives 7-Zip; these are pure functions from
// a result code to a sentence.
namespace sevenzip {

// The high half of an HRESULT that 7-Zip built out of an errno value. Away from
// Windows it has its own facility for them (MY_FACILITY_ERRNO, C/7zTypes.h), so
// a code with these bits set carries an errno in its low half.
constexpr unsigned kErrnoFacility = 0x88000000U;

// "(Is a directory)", or "(HRESULT 0x8007000e)" when the code names nothing the
// C library can describe. Only ever a suffix: a bare code tells a user nothing,
// so it never stands in for a sentence. Shared so that every message spells a
// failure the same way.
std::string HResultSuffix(HRESULT hr);

// Maps a failing OpenArchive() result onto the message the caller reports to
// JavaScript. Every caller shares these strings, so they only have to be kept
// in step in one place. `hr` must not be S_OK.
//
// `path` and `formatIndex` name the archive the caller asked for, so the message
// can say which file and which format failed rather than leaving the reader to
// correlate a bare HRESULT with the call that produced it.
std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex);

// Describes a failing FindEntryIndex() result for JavaScript. `hr` must not be
// S_OK.
std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath);

// Explains a non-kOK IArchiveExtractCallback::SetOperationResult() code. These
// are the codes an unreadable entry actually produces -- an unsupported or
// deliberately unlinked codec, a corrupt body, a truncated archive, an entry
// that needs a password -- so collapsing them into one string would throw away
// the only part a user could act on. Phrased as a clause, to be appended after
// "failed to extract X from Y: ".
std::string OperationResultMessage(int32_t opResult);

}  // namespace sevenzip
