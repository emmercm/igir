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
std::string OpenErrorMessage(HRESULT hr);

// Resolves to an array of entry objects; rejects with an Error on failure.
// `path` is copied, so the caller's JS value need not outlive it.
Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex);

}  // namespace sevenzip
