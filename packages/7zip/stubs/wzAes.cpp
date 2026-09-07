// Stub implementation of NCrypto::NWzAes (WinZip AES, RFC2898/PBKDF2 + HMAC-SHA1),
// satisfying the out-of-line method declarations in the real upstream
// Crypto/WzAes.h so that CPP/7zip/Archive/Zip/ZipHandler.cpp -- which holds a
// real (non-pointer) NCrypto::NWzAes::CDecoder member -- links without pulling
// in Crypto/WzAes.cpp. That upstream .cpp also defines CEncoder (write-path),
// and the global constraint for this addon is that no code capable of writing
// an archive, and none of Crypto/, is linked.
//
// CBaseCoder's own constructor (inline in WzAes.h) unconditionally does
// `_aesCoderSpec = new CAesCtrCoder(32);` -- that construction cannot be
// avoided, so CAesCoder/CAesCtrCoder's own out-of-line members are stubbed
// separately in stubs/myAes.cpp (see that file for why no real AES/C/Aes.c
// code is pulled in by that). `Init2()` (declared protected in CBaseCoder) is
// intentionally NOT defined here: nothing in this stub's own CDecoder methods
// calls it, so it is never odr-used.
//
// Every method here fails cleanly (E_NOTIMPL / false / 0) and touches no
// password or key state. Effect: an entry using WinZip AES reports as
// encrypted but its bytes never decrypt -- matching this addon's design
// (surface isEncrypted, never decrypt; igir never handles passwords).
// CEncoder's methods are not defined here: nothing in this decode-only binary
// ever constructs a CEncoder, so they are never odr-used.

#include "7zip/Crypto/WzAes.h"

namespace NCrypto::NWzAes {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept,readability-convert-member-functions-to-static)

Z7_COM7F_IMF(CBaseCoder::CryptoSetPassword(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

Z7_COM7F_IMF(CBaseCoder::Init()) { return E_NOTIMPL; }

Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

HRESULT CDecoder::ReadHeader(ISequentialInStream* /* inStream */) { return E_NOTIMPL; }

bool CDecoder::Init_and_CheckPassword() { return false; }

HRESULT CDecoder::CheckMac(ISequentialInStream* /* inStream */, bool& isOK) {
    isOK = false;
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept,readability-convert-member-functions-to-static)

}  // namespace NCrypto::NWzAes
