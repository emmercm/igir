// Stub implementation of NCrypto::NZip (legacy PKWARE ZipCrypto), satisfying the
// out-of-line method declarations in the real upstream Crypto/ZipCrypto.h so that
// CPP/7zip/Archive/Zip/ZipHandler.cpp -- which holds a real (non-pointer)
// NCrypto::NZip::CDecoder member and calls into it whenever an entry is marked
// encrypted -- links without pulling in Crypto/ZipCrypto.cpp. That upstream .cpp
// also defines CEncoder (write-path), and the global constraint for this addon
// is that no code capable of writing an archive, and none of Crypto/, is linked.
//
// Every method fails cleanly (E_NOTIMPL / 0) and touches no password state.
// Effect: an entry using classic ZipCrypto reports as encrypted but its bytes
// never decrypt -- matching this addon's design (surface isEncrypted, never
// decrypt; igir never handles passwords). CEncoder's methods are not defined
// here: nothing in this decode-only binary ever constructs a CEncoder, so they
// are never odr-used and would be dead stub code if added.

#include "7zip/Crypto/ZipCrypto.h"

namespace NCrypto::NZip {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept,readability-convert-member-functions-to-static)

Z7_COM7F_IMF(CCipher::CryptoSetPassword(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

Z7_COM7F_IMF(CCipher::Init()) { return E_NOTIMPL; }

Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

HRESULT CDecoder::ReadHeader(ISequentialInStream* /* inStream */) { return E_NOTIMPL; }

void CDecoder::Init_BeforeDecode() {}

// NOLINTEND(modernize-use-noexcept,readability-convert-member-functions-to-static)

}  // namespace NCrypto::NZip
