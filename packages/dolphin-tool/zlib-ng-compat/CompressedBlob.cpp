// zlib-ng vendoring shim — see the "sources" list in binding.gyp.
//
// The upstream unit does `#include <zlib.h>`, but node-gyp lists Node's bundled
// zlib headers ahead of our include_dirs for angle-bracket includes, with no
// portable way to reorder. Compiling the upstream file *through this shim* fixes
// it without editing the Dolphin submodule: the quoted include below resolves
// relative to THIS file, so the vendored zlib-ng <zlib.h> wins (for the build
// and for clang-tidy). Predefining Node's ZLIB_H guard then makes the upstream
// `#include <zlib.h>` a no-op (zlib-ng's own guard is ZLIB_H_, so it is not
// self-suppressed). ZLIB_COMPAT selects zlib-ng's classic zlib API, matching
// the statically-linked zlibng.
#define ZLIB_COMPAT
#include "../deps/dolphin/Externals/zlib-ng/zlib.h"
#ifndef ZLIB_H
#define ZLIB_H
#endif
// NOLINTNEXTLINE(bugprone-suspicious-include) — intentional: build the upstream unit here.
#include "../deps/dolphin/Source/Core/DiscIO/CompressedBlob.cpp"
