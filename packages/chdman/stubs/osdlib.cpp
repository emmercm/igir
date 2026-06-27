// Minimal dependency-free replacement for MAME's POSIX OSD library
// (deps/mame/src/osd/modules/lib/osdlib_unix.cpp on Linux,
// osdlib_macosx.cpp on macOS).
//
// Those files pull in an external dependency solely for clipboard support, which
// the CHD listing/reading code never uses:
//   - osdlib_unix.cpp   #includes <SDL2/SDL.h>
//   - osdlib_macosx.cpp uses CoreFoundation/ApplicationServices
// The only osdlib symbol the compiled MAME subset references is osd_getenv (called
// by osdsync.cpp); every other function those files define (clipboard, process
// control, etc.) is unreferenced. Compiling this in their place keeps the .node
// self-contained (libSystem/glibc only). Windows keeps osdlib_win32.cpp, which
// only uses always-present system DLLs (MAME 0.288, submodule tag mame0288).

#include <cstdlib>

#include "osdcore.h"  // const char *osd_getenv(const char *)

const char* osd_getenv(const char* name) { return std::getenv(name); }
