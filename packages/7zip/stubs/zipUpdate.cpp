// Stub implementation of the write-path methods NArchive::NZip::CHandler declares
// by implementing IOutArchive and ISetProperties.
//
// Unlike CPP/7zip/Archive/7z/7zHandler.h (which guards its IOutArchive/ISetProperties
// base classes behind `#ifndef Z7_EXTRACT_ONLY`), ZipHandler.h (deps/7zip/CPP/7zip/
// Archive/Zip/ZipHandler.h) implements them unconditionally -- CHandler always
// inherits IOutArchive and ISetProperties, regardless of Z7_EXTRACT_ONLY. Their real
// bodies (UpdateItems, GetFileTimeType, SetProperties) live in
// CPP/7zip/Archive/Zip/ZipUpdate.cpp, the archive-writing implementation, which this
// decode-only addon intentionally does not compile (matches the "no code capable of
// writing an archive is linked" constraint already applied to the Crypto/ stubs in
// stubs/zipCrypto.cpp, stubs/wzAes.cpp, stubs/zipStrong.cpp). Without a definition
// somewhere, CHandler's vtable is incomplete and the addon fails to dlopen.
//
// SetCompressCodecsInfo (ISetCompressCodecsInfo, the other non-IInArchive interface
// CHandler implements) is NOT stubbed here: ZipHandler.cpp itself already defines it
// via the IMPL_ISetCompressCodecsInfo macro (see ZipHandler.cpp:1677) -- it is a
// codec-info accessor needed by decode too, not a write-path method.
//
// CHandler::GetOutProperty (a private, non-virtual helper also declared only in
// ZipHandler.h, real body in ZipUpdate.cpp) is deliberately NOT stubbed: nothing in
// this stub's own bodies calls it, and it is not virtual, so its absence never
// reaches the linker -- an unresolved-symbol error there would be a sign this file's
// own stubs started calling into write-path helpers, which they must not do.
//
// Every method fails cleanly (E_NOTIMPL) and never touches an output stream.

#include "7zip/Archive/Zip/ZipHandler.h"

namespace NArchive::NZip {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept)

Z7_COM7F_IMF(CHandler::UpdateItems(ISequentialOutStream* /* outStream */, UInt32 /* numItems */,
                                   IArchiveUpdateCallback* /* updateCallback */)) {
    return E_NOTIMPL;
}

Z7_COM7F_IMF(CHandler::GetFileTimeType(UInt32* /* type */)) { return E_NOTIMPL; }

Z7_COM7F_IMF(CHandler::SetProperties(const wchar_t* const* /* names */, const PROPVARIANT* /* values */,
                                     UInt32 /* numProps */)) {
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept)

}  // namespace NArchive::NZip
