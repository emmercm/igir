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

namespace NCrypto {
namespace NZipStrong {

void CKeyInfo::SetPassword(const Byte * /* data */, UInt32 /* size */)
{
}

CDecoder::CDecoder():
    _cbcDecoder(nullptr)
{
}

Z7_COM7F_IMF(CDecoder::CryptoSetPassword(const Byte * /* data */, UInt32 /* size */))
{
  return E_NOTIMPL;
}

Z7_COM7F_IMF(CDecoder::Init())
{
  return E_NOTIMPL;
}

Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte * /* data */, UInt32 /* size */))
{
  return 0;
}

HRESULT CDecoder::ReadHeader(ISequentialInStream * /* inStream */, UInt32 /* crc */, UInt64 /* unpackSize */)
{
  return E_NOTIMPL;
}

HRESULT CDecoder::Init_and_CheckPassword(bool &passwOK)
{
  passwOK = false;
  return E_NOTIMPL;
}

}}
