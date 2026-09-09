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
// can be reasoned about as ordinary 7-Zip client code.
namespace sevenzip {

// Performs 7-Zip's one-time global setup (CRC tables). Idempotent, and safe to
// call from any thread.
void EnsureInitialized();

// The kName property of every registered archive handler, in registration order.
// Callers address a handler by its position here, so no name matching happens in
// C++. The handler set is fixed at build time, so the names and class IDs are
// read once on the first call and every later lookup is a vector index.
std::vector<std::string> FormatNames();

// The name of the handler at `formatIndex`, for use in error messages.
// Lowercased, because upstream spells two of them `Z` and `Split` and a user
// should not see one spelling in the API and another in an error. Falls back to
// the raw index, which is all there is to say about an out-of-range one.
std::string FormatLabel(uint32_t formatIndex);

// An open, read-only archive plus the stream holding the first volume's file
// handle. Destroying this releases every handle, since any further volumes
// the handler opened are owned by the archive. Nothing else needs to be closed.
struct OpenedArchive {
    CMyComPtr<IInArchive> archive;
    CMyComPtr<IInStream> stream;
};

// Returned when the archive could not be opened for reading.
// This is the numeric value of HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND), spelled
// out because 7-Zip's POSIX shim (Common/MyWindows.h) defines neither of those.
//
// On Windows this shares a facility with genuine Win32 errors, so the two are
// indistinguishable by facility there. Every caller matches this sentinel by
// value first, and its message is what the system's own text for
// ERROR_FILE_NOT_FOUND would have said anyway.
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
// progress callback returns E_ABORT once the flag is set. Opening is not always
// the quick part (a large solid .7z decodes a compressed header here, and a
// spanned set opens every volume), so without it a cancel would not be observed
// until the whole header had been read. Callers that cannot be cancelled pass
// nullptr.
HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out,
                    const std::atomic<bool>* abort = nullptr);

// Reads one item property, returning false when the archive does not carry it in
// the expected type. These are the only places a PROPVARIANT is unpacked, so no
// caller has to know 7-Zip's variant conventions, or that
// ConvertPropVariantToUInt64() throws for a type it does not recognize, which
// GetUInt64Prop() absorbs.
bool GetStringProp(IInArchive& archive, uint32_t index, PROPID id, std::string* out);
bool GetUInt64Prop(IInArchive& archive, uint32_t index, PROPID id, uint64_t* out);
bool GetUInt32Prop(IInArchive& archive, uint32_t index, PROPID id, uint32_t* out);
bool GetBoolProp(IInArchive& archive, uint32_t index, PROPID id);

// Normalizes an entry path to `/` separators. Separators reach us in two
// spellings: an archive built on Windows can record backslashes, and some
// handlers rewrite `/` to the host's separator before kpidPath is read. Every
// path this addon reports or is given goes through this.
std::string NormalizeEntryPath(std::string entryPath);

// True when the item at `index` carries `normalizedPath` (already normalized by
// NormalizeEntryPath). One item-count read and one property read, no scan, which
// is what makes a remembered index worth checking before falling back to
// FindEntryIndex(). An out-of-range index is false, not undefined behavior.
bool EntryIndexMatches(IInArchive& archive, uint32_t index, const std::string& normalizedPath);

// Resolves an entry path to the index 7-Zip extracts by, using an archive the
// caller has already opened. Extraction opens it regardless, so this costs one
// pass over the in-memory item table and no second open.
//
// Separators are compared normalized, so a caller may spell a path with either
// `/` or `\` whatever the archive recorded.
//
// Returns kEntryNotFound when nothing matches, which is the fallback that keeps
// a caller's stale remembered index from mattering.
HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out);

}  // namespace sevenzip
