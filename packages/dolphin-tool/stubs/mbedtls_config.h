// Minimal mbedTLS config (selected via -DMBEDTLS_CONFIG_FILE): only the software
// AES-CBC and SHA-1 primitives Common/Crypto/{AES,SHA1}.cpp need. MBEDTLS_AESNI_C,
// MBEDTLS_PADLOCK_C, and MBEDTLS_HAVE_ASM are deliberately left undefined so the
// library builds with its portable scalar C backend only (global no-SIMD constraint).

#ifndef DOLPHIN_ADDON_MBEDTLS_CONFIG_H
#define DOLPHIN_ADDON_MBEDTLS_CONFIG_H

// Software crypto primitives actually used by DiscIO.
#define MBEDTLS_AES_C
#define MBEDTLS_CIPHER_MODE_CBC
// OFB: Dolphin's Common/Crypto/AES.cpp references mbedtls_aes_crypt_ofb; a Windows
// DLL must resolve it, so compile the OFB mode into aes.c (Linux/macOS tolerate it
// as undefined).
#define MBEDTLS_CIPHER_MODE_OFB
#define MBEDTLS_SHA1_C

// Error string helpers referenced by aes.c / platform glue.
#define MBEDTLS_ERROR_C

#endif  // DOLPHIN_ADDON_MBEDTLS_CONFIG_H
