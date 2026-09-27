# maxcso Node-API Bindings

Read-only Node-API bindings for [maxcso](https://github.com/unknownbrackets/maxcso)'s CSO (v1, v2),
ZSO, and DAX compressed disc images. The addon reuses maxcso's format headers and its bundled
decompressors, and exposes each image as a stream of its uncompressed ISO bytes.

## Licenses

- maxcso: [ISC](deps/maxcso/LICENSE.md), Copyright (c) 2014, Unknown W. Brackets
- lz4: [BSD-2-Clause](deps/maxcso/lz4/lib/LICENSE)
- libdeflate: [MIT](deps/maxcso/libdeflate/COPYING)
- zlib: [Zlib](deps/maxcso/zlib/zlib.h)
