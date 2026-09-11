# Reading Archives

Igir supports scanning the contents of archives for ROMs, DATs, and ROM patches.

## Supported types for reading

Igir supports most common archive formats:

| Extension                                                                                                                          | Contains file CRC32s | Igir can extract without a third-party binary | Igir can checksum without temporary files |
|------------------------------------------------------------------------------------------------------------------------------------|----------------------|-----------------------------------------------|-------------------------------------------|
| `.7z`, `.7z.001` (Brotli, BZip2, copy, DEFLATE, DEFLATE64, Lizard, LZ4, LZ5, LZMA, LZMA2, PPMD, and Zstd) + (BCJ, BCJ2, and Delta) | ✅                   | ✅                                            | ✅                                        |
| `.bz2`/`.bzip2`                                                                                                                    | ❌                   | ✅                                            | ✅                                        |
| `.chd` (v1-5)                                                                                                                      | ❌ SHA1              | ✅                                            | ✅                                        |
| `.cso`, `.zso`, `.dax`                                                                                                             | ❌                   | ❌ Uses bundled `maxcso`                      | ⚠️ CRC32 only                             |
| `.gcz` ([GameCube docs](../usage/console/gamecube.md))                                                                             | ❌                   | ✅                                            | ✅                                        |
| `.gz`/`.gzip`                                                                                                                      | ✅                   | ✅                                            | ✅                                        |
| `.lzma`, `.lzma86`                                                                                                                 | ❌                   | ✅                                            | ✅                                        |
| `.nkit.iso` ([GameCube docs](../usage/console/gamecube.md#nkit))                                                                   | ✅                   | ❌ no extraction support                      | ✅                                        |
| `.rar`                                                                                                                             | ✅                   | ✅                                            | ❌                                        |
| `.rvz` (GameCube, Wii)                                                                                                             | ❌                   | ✅                                            | ✅                                        |
| `.tar`                                                                                                                             | ❌                   | ✅                                            | ✅                                        |
| `.tar.gz`/`.tgz`                                                                                                                   | ❌                   | ✅                                            | ✅                                        |
| `.wia` (Wii)                                                                                                                       | ❌                   | ✅                                            | ✅                                        |
| `.zip`, `.zip.001`, `.z01`, `.zip64` (DEFLATE, store, and Zstd)                                                                    | ✅                   | ✅                                            | ✅                                        |
| `.zipx`, `.zx01`                                                                                                                   | ✅                   | ✅                                            | ✅                                        |
| `.Z`                                                                                                                               | ❌                   | ✅                                            | ✅                                        |

!!! note

    Igir will not read the contents of archives within archives. A warning will be [logged](../advanced/logging.md) for any archive found within an archive.

**You should prefer archive formats that have CRC32 checksum information for each file.**

By default, Igir uses CRC32 information to [match ROMs](../roms/matching.md) to DAT entries. If an archive already contains CRC32 information for each file, then Igir doesn't need to extract any file to compute its CRC32. This can save a lot of time on large archives.

This is why you should use the [`igir zip` command](../output/writing-archives.md) when organizing your primary ROM collection. It is much faster for Igir to scan archives with CRC32 information, speeding up actions such as merging new ROMs into an existing collection.

**You should prefer archive formats that Igir can extract natively.**

Somewhat proprietary archive formats such as `.rar` require Igir to use an external tool to enumerate and extract files. This can greatly slow down processing speed.

This is why Igir uses `.zip` as its output archive of choice, `.zip` files are easy and fast to read, even if they can't offer as high of compression as other formats.

## Exact archive matching

Some DAT files such as the [libretro BIOS System.dat](https://github.com/libretro/libretro-database/blob/master/dat/System.dat) catalog archives such as zip files, rather than the contents of those archives. This type of matching only makes sense with [TorrentZipped archives](../output/writing-archives.md#torrentzip). By default, Igir will try to detect DATs like these and calculate checksums for all archive files, in addition to the files they contain.

This adds a potentially non-trivial amount of processing time during ROM scanning, so this behavior can be turned off with the option:

```text
--input-checksum-archives never
```

If for some reason Igir isn't identifying an input file correctly as an archive, this additional processing can be forced with the option:

```text
--input-checksum-archives always
```

## Checksum cache

It can be expensive to calculate checksums of files within archives. If Igir needs to calculate a checksum not easily read from the archive (see above), it will cache the result in the [file cache](../advanced/file-cache.md).
