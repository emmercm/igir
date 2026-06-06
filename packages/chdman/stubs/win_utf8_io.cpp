// Link stub for deps/mame/3rdparty/flac/src/share/win_utf8_io/win_utf8_io.c.
//
// On Windows, FLAC's stream_decoder.c references fopen_utf8 for its file-based
// decoder init, which the CHD codec never uses (it drives FLAC through the
// stream/callback API). gcc/clang drop the unused init (and this reference) via
// --gc-sections, but MSVC requires the symbol to resolve at link time even from
// dead code. Defining it here avoids compiling FLAC's Windows UTF-8 file shim; the
// body is unreachable (proven by the gcc/clang dead-strip), so it is never run.
#include <stdio.h>

extern "C" {

FILE* fopen_utf8(const char* filename, const char* mode) {
  (void) filename;
  (void) mode;
  return NULL;
}
}
