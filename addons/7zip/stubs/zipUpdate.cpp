// Inert stand-ins for the write-path methods the Zip handler declares by
// implementing IOutArchive and ISetProperties. It implements them
// unconditionally rather than behind Z7_EXTRACT_ONLY, and their real bodies
// live in the archive-writing source this decode-only addon does not compile,
// so without a definition somewhere the handler's vtable is incomplete and the
// addon fails to load.
//
// SetCompressCodecsInfo is not stubbed: the handler defines it itself, and it
// is a codec-info accessor decoding needs too. GetOutProperty is not stubbed
// either: it is private and non-virtual, so its absence never reaches the
// linker, and an unresolved-symbol error for it would mean these stubs had
// started calling into write-path helpers.
//
// Every method fails with E_NOTIMPL and never touches an output stream.

#include "7zip/Archive/Zip/ZipHandler.h"

namespace NArchive::NZip {

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
// NOLINTBEGIN(modernize-use-noexcept)

/** Rejects every attempt to create or update a Zip archive in this extraction-only build. */
Z7_COM7F_IMF(CHandler::UpdateItems(ISequentialOutStream* /* outStream */, UInt32 /* numItems */,
                                   IArchiveUpdateCallback* /* updateCallback */)) {
    return E_NOTIMPL;
}

/** Rejects write-path timestamp queries because archive creation is unavailable. */
Z7_COM7F_IMF(CHandler::GetFileTimeType(UInt32* /* type */)) { return E_NOTIMPL; }

/** Rejects Zip write-property configuration because archive creation is unavailable. */
Z7_COM7F_IMF(CHandler::SetProperties(const wchar_t* const* /* names */, const PROPVARIANT* /* values */,
                                     UInt32 /* numProps */)) {
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept)

}  // namespace NArchive::NZip
