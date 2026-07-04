// Minimal mbedTLS configuration for the Dolphin native addon.
//
// Dolphin's DiscIO code (Common/Crypto/AES.cpp, Common/Crypto/SHA1.cpp) only
// needs software AES-CBC and SHA-1 from mbedTLS. We deliberately do NOT enable
// MBEDTLS_AESNI_C or MBEDTLS_PADLOCK_C, and we leave MBEDTLS_HAVE_ASM undefined,
// so the library is built with its portable, scalar C backends only (global
// no-SIMD constraint). This file is selected via -DMBEDTLS_CONFIG_FILE.
//
// mbedTLS submodule tag matches Dolphin tag 2606.

#ifndef DOLPHIN_ADDON_MBEDTLS_CONFIG_H
#define DOLPHIN_ADDON_MBEDTLS_CONFIG_H

// Software crypto primitives actually used by DiscIO.
#define MBEDTLS_AES_C
#define MBEDTLS_CIPHER_MODE_CBC
#define MBEDTLS_SHA1_C

// Error string helpers referenced by aes.c / platform glue.
#define MBEDTLS_ERROR_C

#endif  // DOLPHIN_ADDON_MBEDTLS_CONFIG_H
