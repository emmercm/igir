// Inert stand-ins for NCrypto::CAesCoder, the AES primitive. The WinZip AES
// coder's constructor is inline in the vendored header and unconditionally does
// `new CAesCtrCoder(32)`, and the Zip handler holds one of those by value, so
// every Zip open constructs it -- CAesCoder's out-of-line members must link
// even though this no-crypto addon never lets any AES code run.
//
// Nothing here touches key material or reaches a real AES primitive. The two
// C-linkage symbols below exist only because CAesCtrCoder's inline constructor
// takes their addresses; Filter() returns 0 before either could be used.
//
// Aes_SetKey_Dec, g_AesCbc_*, AesGenTables and AesCbc_Init are deliberately NOT
// defined: nothing constructs a CBC decoder. If the linker ever asks for one of
// them, real crypto is being pulled in somewhere it should not be -- do not add
// C/Aes.c to satisfy it.

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

// The Z7_COM7F_* macros expand to 7-Zip's `throw()` specification, which comes
// from the vendored declarations these definitions have to match.
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
