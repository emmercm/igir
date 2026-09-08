// Inert stand-ins for NCompress::NBZip2::CEncoder, the BZip2 compressor. This
// decode-only addon does not compile the real encoder, but it does compile the
// bzip2 handler, whose write path is not guarded behind Z7_EXTRACT_ONLY -- so
// the reference to CEncoder reaches the linker whether or not any archive is
// ever written.
//
// CThreadInfo::Free() is defined because CEncoder holds a CThreadInfo by value
// and its inline destructor calls it; the empty body is correct, since nothing
// here allocates the buffers it would release. Code() and SetCoderProperties()
// are defined because the vtable is emitted alongside Code(), the first
// non-inline virtual, so the class is otherwise not constructible. Both fail
// with E_NOTIMPL without touching the output stream.
//
// The encoder's own non-virtual helpers are deliberately NOT stubbed: nothing
// here calls them, so an unresolved-symbol report for one would mean this file
// had started calling into real compression code.

#include "7zip/Compress/BZip2Encoder.h"

namespace NCompress::NBZip2 {

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
// NOLINTBEGIN(modernize-use-noexcept)

void CThreadInfo::Free() {}

// Not `= default`: NumBlocks is a plain field of the upstream class, and the
// real encoder is what would otherwise set it. Nothing here reads it, but
// leaving it indeterminate would make the value visible to Bz2Handler.
CEncoder::CEncoder() : NumBlocks(0) {}

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
