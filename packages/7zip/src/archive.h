#pragma once

#include <napi.h>
#include <string>
#include <vector>

#include "Common/MyWindows.h"
#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"

namespace sevenzip {

// Performs 7-Zip's one-time global setup (CRC tables). Idempotent, and must be
// called on the JS thread before any other 7-Zip entry point.
void EnsureInitialized();

// The kName property of every registered archive handler, in registration order.
// index.ts turns this list into the name -> index map it passes back here, so no
// name matching happens in C++.
//
// The handler set is fixed at build time, so the names and their class IDs are
// read from the registry once, on the first call, and every later lookup is a
// vector index. Nothing re-enumerates the handlers per archive.
std::vector<std::string> FormatNames();

// An open, read-only archive plus the stream holding the first volume's file
// handle. Destroying this releases every handle -- any further volumes the
// handler opened are owned by the archive. Nothing else needs to be closed.
struct OpenedArchive {
    CMyComPtr<IInArchive> archive;
    CMyComPtr<IInStream> stream;
};

// Returned when the archive could not be opened for reading.
// This is the numeric value of HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND), spelled
// out because 7-Zip's POSIX shim (Common/MyWindows.h) defines neither of those.
constexpr HRESULT kVolumeOpenFailed = static_cast<HRESULT>(0x80070002L);

// The high half of an HRESULT that 7-Zip built out of an errno value. Away from
// Windows it has its own facility for them (MY_FACILITY_ERRNO, C/7zTypes.h), so
// a code with these bits set carries an errno in its low half.
constexpr unsigned kErrnoFacility = 0x88000000U;

// "(Is a directory)", or "(HRESULT 0x8007000e)" when the code names nothing the
// C library can describe. Only ever a suffix: a bare code tells a user nothing,
// so it never stands in for a sentence. Shared so that every message spells a
// failure the same way.
std::string HResultSuffix(HRESULT hr);

// Returned by FindEntryIndex() when no entry carries the requested path.
// HRESULT_FROM_WIN32(ERROR_NOT_FOUND), spelled out for the same reason.
constexpr HRESULT kEntryNotFound = static_cast<HRESULT>(0x80070490L);

// Opens the archive at `path` with the handler at `formatIndex` in FormatNames()
// order. Callers guarantee a non-empty path and an in-range index; anything else
// is E_INVALIDARG.
//
// `path` names ONE file even for a multi-volume archive: pass the first volume
// (`.7z.001`, `.z01`, `.001`) and the handler discovers its siblings through the
// open callback. Callers never enumerate or order volumes themselves.
HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out);

// Maps a failing OpenArchive() result onto the message the caller reports to
// JavaScript. Every caller shares these strings, so they only have to be kept
// in step in one place. `hr` must not be S_OK.
//
// `path` and `formatIndex` name the archive the caller asked for, so the message
// can say which file and which format failed rather than leaving the reader to
// correlate a bare HRESULT with the call that produced it.
std::string OpenErrorMessage(HRESULT hr, const std::string& path, uint32_t formatIndex);

// Resolves an entry path to the index 7-Zip extracts by, using the archive the
// caller has ALREADY opened -- extraction has to open it regardless, so this
// costs one pass over the in-memory item table and no second open.
//
// Separators are compared normalized: 7-Zip reports them as the source archive
// recorded them, so an entry from a Windows-built .zip carries backslashes, and
// callers should not have to care.
//
// Returns kEntryNotFound when nothing matches. This is the ONLY place a path is
// matched against an entry -- JavaScript never lists an archive just to turn a
// name into a number.
HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out);

// Describes a failing FindEntryIndex() result for JavaScript. `hr` must not be
// S_OK.
std::string FindEntryErrorMessage(HRESULT hr, const std::string& entryPath);

// Resolves to an array of entry objects; rejects with an Error on failure.
// `path` is copied, so the caller's JS value need not outlive it.
Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex);

}  // namespace sevenzip
