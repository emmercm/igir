// Stub implementation of NCrypto::NZipStrong (PKWARE "strong encryption",
// AES-CBC keyed via a master key), satisfying the out-of-line method
// declarations in the real upstream Crypto/ZipStrong.h so that
// CPP/7zip/Archive/Zip/ZipHandler.cpp -- which holds a real (non-pointer)
// NCrypto::NZipStrong::CDecoder member -- links without pulling in
// Crypto/ZipStrong.cpp. The global constraint for this addon is that no code
// capable of writing an archive, and none of Crypto/, is linked (ZipStrong.cpp
// has no separate encoder class of its own, but it does depend on real AES).
//
// The key property that keeps this stub small: CDecoder::_cbcDecoder is a
// `CAesCbcDecoder *` (a pointer, not a value member). The real ZipStrong.cpp
// lazily `new`s one inside Init_and_CheckPassword(). Our CDecoder constructor
// below sets it to nullptr and no method here ever allocates one, so
// CAesCbcDecoder's own vtable/constructor is never instantiated and
// C/Aes.c-derived code stays out of this binary entirely (see stubs/myAes.cpp,
// which stubs only the CAesCtrCoder path that CPP/7zip/Crypto/WzAes.h's
// CBaseCoder constructor unconditionally requires -- unrelated to this file).
//
// Every method fails cleanly (E_NOTIMPL / false / 0) and touches no password
// or key state. Effect: an entry using PKWARE strong encryption reports as
// encrypted but its bytes never decrypt -- matching this addon's design
// (surface isEncrypted, never decrypt; igir never handles passwords).

#include "7zip/Crypto/ZipStrong.h"

namespace NCrypto::NZipStrong {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept,readability-convert-member-functions-to-static)

void CKeyInfo::SetPassword(const Byte* /* data */, UInt32 /* size */) {}

// Every field is zeroed even though no method here ever reads one: the
// upstream class leaves them to be filled in by the real ReadHeader(), which
// this file replaces with E_NOTIMPL, so without this they would stay
// indeterminate for the lifetime of every CHandler that opens a zip.
CDecoder::CDecoder() : _cbcDecoder(nullptr), _key{}, _ivSize(0), _iv{}, _remSize(0) {}

Z7_COM7F_IMF(CDecoder::CryptoSetPassword(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

Z7_COM7F_IMF(CDecoder::Init()) { return E_NOTIMPL; }

Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

HRESULT CDecoder::ReadHeader(ISequentialInStream* /* inStream */, UInt32 /* crc */, UInt64 /* unpackSize */) {
    return E_NOTIMPL;
}

HRESULT CDecoder::Init_and_CheckPassword(bool& passwOK) {
    passwOK = false;
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept,readability-convert-member-functions-to-static)

}  // namespace NCrypto::NZipStrong
