/*
 * Compile the unmodified legacy frame implementation without MSVC
 * optimization. Windows x64 builds produced through Node 26 misdecode the
 * smallest raw frame with optimized code, while compressed frames and builds
 * produced through Node 22 are unaffected. Inline XXH32 in this translation
 * unit so its raw-block checksum path receives the same targeted treatment.
 */
#ifdef _MSC_VER
#define XXH_INLINE_ALL
#pragma optimize("", off)
#endif

#include "../deps/7-Zip-zstd/C/lizard/lizard_frame.c"

#ifdef _MSC_VER
#pragma optimize("", on)
#endif
