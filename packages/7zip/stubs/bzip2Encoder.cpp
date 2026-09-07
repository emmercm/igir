// Stub implementation of NCompress::NBZip2::CEncoder (Compress/BZip2Encoder.h), the
// BZip2 compressor that CPP/7zip/Archive/Bz2Handler.cpp instantiates in its
// UpdateArchive() helper: `CMyComPtr2_Create<ICompressCoder, NCompress::NBZip2::CEncoder>`.
//
// Bz2Handler.cpp is compiled by this addon for its IInArchive half (it registers the
// "bzip2" format), and unlike CPP/7zip/Archive/7z/7zHandler.cpp it does NOT guard its
// write path behind Z7_EXTRACT_ONLY -- UpdateArchive(), GetFileTimeType() and
// UpdateItems() are compiled unconditionally, so the reference to CEncoder's
// constructor reaches the linker whether or not any archive is ever written. The real
// bodies live in CPP/7zip/Compress/BZip2Encoder.cpp, the BZip2 compressor, which this
// decode-only addon intentionally does not compile (same reasoning as
// stubs/zipUpdate.cpp for the Zip write path and stubs/myAes.cpp for AES).
//
// Only CEncoder is stubbed. CThreadInfo::Free() is defined too, but not because
// anything calls it deliberately: CEncoder holds a CThreadInfo by value under Z7_ST,
// and CThreadInfo's inline destructor (BZip2Encoder.h) calls Free(). Without it the
// implicit ~CEncoder() would reference a symbol that lives only in the real encoder.
// Its body here is empty and correct: this file's CEncoder constructor never allocates
// any of the buffers Free() would release, so there is nothing to release.
//
// Code() and SetCoderProperties() are defined rather than left out because CEncoder's
// vtable is emitted alongside its key function -- Code(), the first non-inline virtual
// declared -- so a definition must exist in this translation unit for the object to be
// constructible at all. Both fail cleanly (E_NOTIMPL) and never touch the output
// stream, so Bz2Handler's UpdateArchive() returns an error at its first RINOK instead
// of jumping to address 0.
//
// CodeReal(), ReadRleBlock(), WriteBytes(), WriteByte() and Flush() are the encoder's
// own non-virtual helpers, declared only in BZip2Encoder.h. They are deliberately NOT
// stubbed: nothing in this file's bodies calls them, so their absence never reaches
// the linker. An unresolved-symbol report for one of them would mean this stub had
// started calling into real compression code, which it must not do.

#include "7zip/Compress/BZip2Encoder.h"

namespace NCompress::NBZip2 {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept)

void CThreadInfo::Free() {}

// Not `= default`: NumBlocks is a plain field of the upstream class, and the
// real encoder is what would otherwise set it. Nothing here reads it, but
// leaving it indeterminate would make the value visible to Bz2Handler.
CEncoder::CEncoder() { NumBlocks = 0; }

Z7_COM7F_IMF(CEncoder::Code(ISequentialInStream* /* inStream */, ISequentialOutStream* /* outStream */,
                            const UInt64* /* inSize */, const UInt64* /* outSize */,
                            ICompressProgressInfo* /* progress */)) {
    return E_NOTIMPL;
}

Z7_COM7F_IMF(CEncoder::SetCoderProperties(const PROPID* /* propIDs */, const PROPVARIANT* /* coderProps */,
                                          UInt32 /* numProps */)) {
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept)

}  // namespace NCompress::NBZip2
