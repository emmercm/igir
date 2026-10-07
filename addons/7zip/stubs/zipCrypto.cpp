// Inert stand-ins for NCrypto::NZip (legacy PKWARE ZipCrypto), so that the Zip
// handler, which holds a real, non-pointer CDecoder member and calls into it
// for every entry marked encrypted, links without pulling in the upstream
// source. That source also defines the write-path CEncoder, and this addon
// links no archive-writing code and nothing from Crypto/.
//
// Every method fails cleanly and touches no password state, so an entry using
// ZipCrypto reports as encrypted and never decrypts. CEncoder's methods are not
// defined here: nothing constructs one, so they are never odr-used.

#include "7zip/Crypto/ZipCrypto.h"

namespace NCrypto::NZip {

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
// NOLINTBEGIN(modernize-use-noexcept,readability-convert-member-functions-to-static)

/** Rejects legacy ZipCrypto passwords without retaining their bytes. */
Z7_COM7F_IMF(CCipher::CryptoSetPassword(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

/** Rejects legacy ZipCrypto initialization because cryptography is excluded. */
Z7_COM7F_IMF(CCipher::Init()) { return E_NOTIMPL; }

/** Produces no decrypted bytes for unsupported ZipCrypto entries. */
Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

/** Rejects parsing a ZipCrypto header because no decoder is linked. */
HRESULT CDecoder::ReadHeader(ISequentialInStream* /* inStream */) { return E_NOTIMPL; }

/** Performs no pre-decode setup because the cipher is inert. */
void CDecoder::Init_BeforeDecode() {}

// NOLINTEND(modernize-use-noexcept,readability-convert-member-functions-to-static)

}  // namespace NCrypto::NZip
