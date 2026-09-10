// Inert stand-ins for NCrypto::NZipStrong (PKWARE "strong encryption"), so that
// the Zip handler, which holds a real, non-pointer CDecoder member, links
// without pulling in the upstream source, which depends on real AES. This addon
// links no archive-writing code and nothing from Crypto/.
//
// What keeps this stub small is that _cbcDecoder is a pointer rather than a
// value member: the constructor below leaves it null and no method here ever
// allocates one, so CAesCbcDecoder is never instantiated and no AES code
// reaches the binary through this file.
//
// Every method fails cleanly and touches no password or key state, so an entry
// using strong encryption reports as encrypted and never decrypts.

#include "7zip/Crypto/ZipStrong.h"

namespace NCrypto::NZipStrong {

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
// NOLINTBEGIN(modernize-use-noexcept,readability-convert-member-functions-to-static)

/** Discards strong-encryption password bytes because cryptography is excluded. */
void CKeyInfo::SetPassword(const Byte* /* data */, UInt32 /* size */) {}

// Every field is zeroed even though no method here ever reads one: the
// upstream class leaves them to be filled in by the real ReadHeader(), which
// this file replaces with E_NOTIMPL, so without this they would stay
// indeterminate for the lifetime of every CHandler that opens a zip
/** Zero-initializes inert decoder state and leaves the absent CBC decoder null. */
CDecoder::CDecoder() : _cbcDecoder(nullptr), _key{}, _ivSize(0), _iv{}, _remSize(0) {}

/** Rejects strong-encryption passwords without retaining their bytes. */
Z7_COM7F_IMF(CDecoder::CryptoSetPassword(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

/** Rejects strong-encryption initialization because cryptography is excluded. */
Z7_COM7F_IMF(CDecoder::Init()) { return E_NOTIMPL; }

/** Produces no decrypted bytes for unsupported strong-encryption entries. */
Z7_COM7F_IMF2(UInt32, CDecoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

/** Rejects parsing a strong-encryption header because no decoder is linked. */
HRESULT CDecoder::ReadHeader(ISequentialInStream* /* inStream */, UInt32 /* crc */, UInt64 /* unpackSize */) {
    return E_NOTIMPL;
}

/** Marks the password invalid and reports that password checking is unsupported. */
HRESULT CDecoder::Init_and_CheckPassword(bool& passwOK) {
    passwOK = false;
    return E_NOTIMPL;
}

// NOLINTEND(modernize-use-noexcept,readability-convert-member-functions-to-static)

}  // namespace NCrypto::NZipStrong
