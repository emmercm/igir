// Link stubs for deps/mame/3rdparty/utf8proc/utf8proc.c.
//
// unicode.cpp's normalize_unicode() / uchar_toupper() / uchar_tolower() forward to
// these utf8proc functions, but the CHD listing/reading code never calls those, so
// gcc/clang drop them (and these references) via -ffunction-sections + --gc-sections
// (macOS dead-strip). MSVC, however, still requires every symbol referenced by a
// pulled-in object to resolve at link time even from dead code. Defining the symbols
// here satisfies the Windows linker without compiling utf8proc's ~2 MB Unicode
// tables; the bodies are unreachable (proven by the gcc/clang dead-strip), so their
// trivial behavior is never run.
#include <cstddef>
#include <cstdint>

extern "C" {

int32_t utf8proc_tolower(int32_t c) { return c; }

int32_t utf8proc_toupper(int32_t c) { return c; }

ptrdiff_t utf8proc_map(const uint8_t* str, ptrdiff_t strlen, uint8_t** dstptr, int options) {
    (void)str;
    (void)strlen;
    (void)options;
    if (dstptr != nullptr) {
        *dstptr = nullptr;
    }
    return -1;
}
}
