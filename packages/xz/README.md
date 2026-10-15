# xz

A pure-TypeScript decoder for xz streams that contain one LZMA2 block, for streams that are decoded in parts and never finished, the way xdelta3 writes its LZMA secondary compression.

## Credits

This code is ported from:

- [XZ Utils](https://tukaani.org/xz/) v5.8.1's liblzma (0BSD)
- The [.xz file format specification](https://github.com/tukaani-project/xz/blob/v5.8.1/doc/xz-file-format.txt) (public domain)
