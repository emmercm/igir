#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <vector>

#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"
#include "Common/MyWindows.h"

// The vendored-7-Zip layer: opening archives, enumerating handlers, and reading
// item properties. Nothing here knows about N-API, promises, or threads, so it
// can be reasoned about as ordinary 7-Zip client code. The N-API surface that
// drives it lives in lister.h and entryReader.h; the strings it fails with live
// in errors.h.
namespace sevenzip {

// Performs 7-Zip's one-time global setup (CRC tables). Idempotent, and safe to
// call from any thread.
void EnsureInitialized();

// The kName property of every registered archive handler, in registration order.
// index.ts turns this list into the name -> index map it passes back here, so no
// name matching happens in C++.
//
// The handler set is fixed at build time, so the names and their class IDs are
// read from the registry once, on the first call, and every later lookup is a
// vector index. Nothing re-enumerates the handlers per archive.
std::vector<std::string> FormatNames();

// The handler name index.ts asked for, for use in error messages. Lowercased to
// match the names index.ts exposes -- upstream spells two of them `Z` and
// `Split`, and a user should not see one spelling in the API and another in an
// error. Falls back to the raw index, which is all there is to say about an
// out-of-range one.
std::string FormatLabel(uint32_t formatIndex);

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
//
// `abort` is optional. When given, the open is interruptible: the handler's
// progress callback returns E_ABORT once the flag is set, and Open() unwinds
// with that. This matters because opening is not always the quick part -- a
// large solid .7z has a compressed header that is decoded here, and a spanned
// set opens every volume -- so without it a cancel issued during the open would
// not be observed until the whole header had been read. Callers that cannot be
// cancelled pass nullptr.
HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out,
                    const std::atomic<bool>* abort = nullptr);

// Reads one item property, returning false when the archive does not carry it in
// the expected type. These are the only places a PROPVARIANT is unpacked, so no
// caller has to know 7-Zip's variant conventions -- or to remember that
// ConvertPropVariantToUInt64() throws for a type it does not recognize, which
// GetUInt64Prop() absorbs (a missing or odd property is not worth failing over).
bool GetStringProp(IInArchive& archive, uint32_t index, PROPID id, std::string* out);
bool GetUInt64Prop(IInArchive& archive, uint32_t index, PROPID id, uint64_t* out);
bool GetUInt32Prop(IInArchive& archive, uint32_t index, PROPID id, uint32_t* out);
bool GetBoolProp(IInArchive& archive, uint32_t index, PROPID id);

// Normalizes an entry path for comparison: 7-Zip reports separators as the
// source archive recorded them, so an entry from a Windows-built .zip carries
// backslashes. Both sides of every comparison go through this, which is what
// lets a caller spell a path with either `/` or `\`.
std::string NormalizeEntryPath(std::string entryPath);

// True when the item at `index` carries `normalizedPath` (already normalized by
// NormalizeEntryPath). One property read, no scan: this is what makes a caller's
// remembered index worth checking before falling back to FindEntryIndex().
bool EntryIndexMatches(IInArchive& archive, uint32_t index, const std::string& normalizedPath);

// Resolves an entry path to the index 7-Zip extracts by, using the archive the
// caller has ALREADY opened -- extraction has to open it regardless, so this
// costs one pass over the in-memory item table and no second open.
//
// Separators are compared normalized, so a caller may spell a path with either
// `/` or `\` whatever the archive recorded. Note that this tolerance is on the
// INPUT side only: the paths reported out of an archive (see lister.h) are
// verbatim, exactly as the archive recorded them.
//
// Returns kEntryNotFound when nothing matches. A caller that remembers an index
// from a previous listing checks it with EntryIndexMatches() first and falls
// back here; the fallback is what keeps a stale index from ever mattering.
HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out);

}  // namespace sevenzip
