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

/** Idempotently and thread-safely runs 7-Zip's process-wide CRC-table initialization once. */
void EnsureInitialized();

/**
 * Returns build-time archive-handler names in registration and numeric-API order.
 * Names and class IDs are read once; later lookups use the cached vector index.
 */
std::vector<std::string> FormatNames();

/** Returns a lowercase error-message label, falling back to the numeric index when invalid. */
std::string FormatLabel(uint32_t formatIndex);

/**
 * Owns an opened archive and its first-volume stream.
 * Destroying both releases every handle; the archive owns any additional volume streams.
 */
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

/**
 * Opens one archive with the indexed handler and transfers owned interfaces to `out`.
 *
 * The path names the first file of a multi-volume set; callbacks discover its
 * siblings. Invalid paths or indexes return E_INVALIDARG. The optional abort
 * flag interrupts costly header decoding and volume discovery through progress callbacks.
 */
HRESULT OpenArchive(const std::string& path, uint32_t formatIndex, OpenedArchive* out,
                    const std::atomic<bool>* abort = nullptr);

/** Reads a BSTR item property into UTF-8, returning false for missing, failed, or mismatched values. */
bool GetStringProp(IInArchive& archive, uint32_t index, PROPID id, std::string* out);
/** Reads an integer-like PROPVARIANT as 64 bits, returning false and containing conversion exceptions. */
bool GetUInt64Prop(IInArchive& archive, uint32_t index, PROPID id, uint64_t* out);
/** Reads an exact 32-bit unsigned item property. */
bool GetUInt32Prop(IInArchive& archive, uint32_t index, PROPID id, uint32_t* out);
/** Reads a Boolean item property, treating missing or mismatched values as false. */
bool GetBoolProp(IInArchive& archive, uint32_t index, PROPID id);

/** Normalizes recorded or host-rewritten entry separators to `/` without otherwise changing the path. */
std::string NormalizeEntryPath(std::string entryPath);

/** Bounds-checks an index and compares its normalized stored path without scanning; out-of-range is false. */
bool EntryIndexMatches(IInArchive& archive, uint32_t index, const std::string& normalizedPath);

/**
 * Scans an already-open archive for a separator-normalized path and returns its extraction index.
 * Returns kEntryNotFound when no item matches.
 */
HRESULT FindEntryIndex(IInArchive& archive, const std::string& entryPath, uint32_t* out);

}  // namespace sevenzip
