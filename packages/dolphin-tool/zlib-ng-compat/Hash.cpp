// zlib-ng vendoring shim — see the "sources" list in binding.gyp, and the sibling
// CompressedBlob.cpp shim for the full rationale. Common/Hash.cpp does
// `#include <zlib.h>` for adler32/crc32; compiling it through this shim forces the
// vendored zlib-ng header (quoted include, resolved relative to this file) instead
// of Node's bundled copy, and gates Node's out via its ZLIB_H guard.
#define ZLIB_COMPAT
// See CompressedBlob.cpp shim: undefine Node's Windows ZLIB_DLL so zlib-ng's
// <zlib.h> declares adler32/crc32 as plain `extern` bound to the vendored static
// library, not __declspec(dllimport) from node.exe.
#undef ZLIB_DLL
#include "../deps/dolphin/Externals/zlib-ng/zlib.h"
#ifndef ZLIB_H
#define ZLIB_H
#endif
// NOLINTNEXTLINE(bugprone-suspicious-include) — intentional: build the upstream unit here.
#include "../deps/dolphin/Source/Core/Common/Hash.cpp"
