// Inert stand-ins for NCrypto::NWzAes (WinZip AES), so that the Zip handler --
// which holds a real, non-pointer CDecoder member -- links without pulling in
// the upstream source. That source also defines the write-path CEncoder, and
// this addon links no archive-writing code and nothing from Crypto/.
//
// CBaseCoder's inline constructor unconditionally news a CAesCtrCoder, which is
// stubbed separately in stubs/myAes.cpp. Init2() is not defined here because
// nothing in this file calls it, so it is never odr-used; the same goes for
// CEncoder's methods.
//
// Every method fails cleanly and touches no password or key state, so an entry
// using WinZip AES reports as encrypted and never decrypts.

#include "7zip/Crypto/WzAes.h"

namespace NCrypto::NWzAes {

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
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
