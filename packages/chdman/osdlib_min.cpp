// Minimal SDL-free OSD library for the chdman addon on Linux.
//
// MAME's deps/mame/src/osd/modules/lib/osdlib_unix.cpp (MAME 0.288) unconditionally
// #includes <SDL2/SDL.h> (for clipboard support), which would add an external SDL
// dependency to the .node. The CHD listing/reading code never touches the clipboard
// or any other SDL-backed osdlib function; the only osdlib symbol it references is
// osd_getenv (called by osdsync.cpp). Compile this file in place of osdlib_unix.cpp
// so the addon stays self-contained. macOS/Windows keep MAME's own osdlib_*.cpp,
// neither of which pulls in SDL.
#include "osdcore.h"  // const char *osd_getenv(const char *)

#include <cstdlib>

const char* osd_getenv(const char* name) {
  return std::getenv(name);
}
