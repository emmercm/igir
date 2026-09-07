// Stub implementation of NCrypto::CAesCoder (Crypto/MyAes.h), the AES primitive
// that CPP/7zip/Crypto/WzAes.h's CBaseCoder constructor unconditionally
// instantiates via `new CAesCtrCoder(32)` -- CAesCtrCoder derives from
// CAesCoder, and NCrypto::NWzAes::CDecoder (a real, non-pointer member of
// ZipHandler.cpp's CHandler) constructs one every time a Zip archive is opened.
// That construction cannot be avoided (the ctor is inline in the upstream
// header), so CAesCoder's own out-of-line members must exist and link, even
// though this decode-only, no-crypto addon never lets any AES code run.
//
// This does NOT link C/Aes.c or CPP/7zip/Crypto/MyAes.cpp: every method here is
// a real (but inert) override that never touches key material or calls the
// real Aes_SetKey_Enc/g_Aes*_Code primitives. CAesCtrCoder's own inline
// constructor (CPP/7zip/Crypto/MyAes.h) assigns `_setKeyFunc = Aes_SetKey_Enc;
// _codeFunc = g_AesCtr_Code;` -- those are only address-of assignments (never
// invoked, since Filter() below always returns 0 before reaching _codeFunc), so
// the two symbols below are trivial stand-ins, not real AES.
//
// CAesCbcEncoder is excluded under Z7_EXTRACT_ONLY already (see MyAes.h). This
// addon never constructs CAesCbcDecoder either (NCrypto::NZipStrong::CDecoder
// keeps `_cbcDecoder` null forever -- see stubs/zipStrong.cpp), so
// Aes_SetKey_Dec/g_AesCbc_Decode/g_AesCbc_Encode/AesGenTables/AesCbc_Init are
// never referenced and are intentionally NOT defined here. If a future change
// makes the linker ask for one of those, that is a sign real crypto is being
// pulled in somewhere it should not be -- do not add C/Aes.c to satisfy it.

#include "7zip/Crypto/MyAes.h"

// C/Aes.h declares Aes_SetKey_Enc and g_AesCtr_Code inside an EXTERN_C_BEGIN/
// EXTERN_C_END block at global scope (it is a plain C header, not aware of the
// NCrypto namespace). They must be defined here at matching global, C-linkage
// scope -- defining them inside `namespace NCrypto` would silently give the
// symbols C++ (mangled) linkage instead of the plain C symbol names
// (`_Aes_SetKey_Enc` / `_g_AesCtr_Code`) that CAesCtrCoder's inline constructor
// in Crypto/MyAes.h references.
extern "C" {

// Only the address of this function is ever taken (by CAesCtrCoder's inline
// constructor); Filter() below never calls through _setKeyFunc.
void Z7_FASTCALL Aes_SetKey_Enc(UInt32* /* aes */, const Byte* /* key */, unsigned /* keySize */) {}

// Only the address of this variable is ever taken; never dereferenced/called.
AES_CODE_FUNC g_AesCtr_Code = nullptr;

}  // extern "C"

namespace NCrypto {

// The Z7_COM7F_* macros below expand to 7-Zip's `throw()` exception
// specification, and every method defined here overrides one the vendored
// header declares -- so nothing in this file can be spelled `noexcept`, nor
// made static, without changing the upstream declarations it exists to match.
// NOLINTBEGIN(modernize-use-noexcept)

CAesCoder::CAesCoder(unsigned keySize)
    : _keyIsSet(false),
      _keySize(keySize),
      _ctrPos(0),
      _codeFunc(nullptr),
      _setKeyFunc(nullptr),
      _aes((AES_NUM_IVMRK_WORDS * 4) + (AES_BLOCK_SIZE * 2)),
      _iv{} {}

Z7_COM7F_IMF(CAesCoder::Init()) { return E_NOTIMPL; }

Z7_COM7F_IMF2(UInt32, CAesCoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }

Z7_COM7F_IMF(CAesCoder::SetKey(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

Z7_COM7F_IMF(CAesCoder::SetInitVector(const Byte* /* data */, UInt32 /* size */)) { return E_NOTIMPL; }

#ifndef Z7_SFX
Z7_COM7F_IMF2(UInt32, CAesCtrCoder::Filter(Byte* /* data */, UInt32 /* size */)) { return 0; }
#endif

// NOLINTEND(modernize-use-noexcept)

}  // namespace NCrypto
