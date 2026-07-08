// Minimal mbedTLS config (selected via -DMBEDTLS_CONFIG_FILE): only the software
// AES-CBC and SHA-1 primitives Common/Crypto/{AES,SHA1}.cpp need. MBEDTLS_AESNI_C,
// MBEDTLS_PADLOCK_C, and MBEDTLS_HAVE_ASM are left undefined for a portable scalar
// build (global no-SIMD constraint).

#ifndef DOLPHIN_ADDON_MBEDTLS_CONFIG_H
#define DOLPHIN_ADDON_MBEDTLS_CONFIG_H

// Software crypto primitives actually used by DiscIO.
#define MBEDTLS_AES_C
#define MBEDTLS_CIPHER_MODE_CBC
// AES.cpp references mbedtls_aes_crypt_ofb, which a Windows DLL must resolve, so
// compile the OFB mode into aes.c.
#define MBEDTLS_CIPHER_MODE_OFB
#define MBEDTLS_SHA1_C

// Error string helpers referenced by aes.c / platform glue.
#define MBEDTLS_ERROR_C

#endif  // DOLPHIN_ADDON_MBEDTLS_CONFIG_H
