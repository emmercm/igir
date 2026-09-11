/**
 * Compiles the vendored Lizard frame decoder with a targeted MSVC workaround.
 *
 * Optimized Windows x64 builds produced with Node.js 26 misdecode small raw
 * Lizard frames. Keep optimization disabled only for this legacy frame
 * implementation and inline its XXH32 implementation so the checksum path is
 * compiled with the same setting. Other compilers and all other 7-Zip code
 * retain the project's normal optimization settings.
 */
#ifdef _MSC_VER
#define XXH_INLINE_ALL
#pragma optimize("", off)
#endif

#include "../deps/7-Zip-zstd/C/lizard/lizard_frame.c"

#ifdef _MSC_VER
#pragma optimize("", on)
#endif
