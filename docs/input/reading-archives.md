# Reading Archives

`igir` supports scanning the contents of archives for ROMs, DATs, and ROM patches.

## Supported types for reading

`igir` supports most common archive formats:

| Extension                | Contains file CRC32s | `igir` can extract without a third-party binary | `igir` can checksum without temporary files |
|--------------------------|----------------------|-------------------------------------------------|---------------------------------------------|
| `.7z`                    | ✅                    | ❌                                               | ❌                                           |
| `.gz`, `.gzip`           | ❌ CRC16              | ❌                                               | ❌                                           |
| `.rar`                   | ✅                    | ✅                                               | ❌                                           |
| `.tar`                   | ❌                    | ✅                                               | ✅ ≤64MiB                                    |
| `.tar.gz`, `.tgz`        | ❌                    | ✅                                               | ✅ ≤64MiB                                    |
| `.z01`                   | ✅                    | ❌                                               | ❌                                           |
| `.zip` (including zip64) | ✅                    | ✅                                               | ✅ ≤64MiB                                    |
| `.zip.001`               | ✅                    | ❌                                               | ❌                                           |
| `.zipx`                  | ✅                    | ❌                                               | ❌                                           |

**You should prefer archive formats that have CRC32 checksum information for each file.**

By default, `igir` uses CRC32 information to [match ROMs](../roms/matching.md) to DAT entries. If an archive already contains CRC32 information for each file, then `igir` doesn't need to extract each file and compute its CRC32. This can save a lot of time on large archives.

This is why you should use the [`igir zip` command](../output/writing-archives.md) when organizing your primary ROM collection. It is much faster for `igir` to scan archives with CRC32 information, speeding up actions such as merging new ROMs into an existing collection.

**You should prefer archive formats that `igir` can extract natively.**

Somewhat proprietary archive formats such as `.7z` and `.rar` require `igir` to use an external tool to enumerate and extract files. This can greatly slow down processing speed.

This is why `igir` uses `.zip` as its output archive of choice, `.zip` files are easy and fast to read, even if they can't offer as high of compression as other formats.

## Checksum cache

It can be expensive to calculate checksums of files within archives, especially MD5, SHA1, and SHA256. If `igir` needs to calculate a checksum that is not easily read from the archive (see above), it will cache the result in a file named `igir.cache`. This cached result will then be used as long as the input file's size and modified timestamp remain the same.

The location of this cache file can be controlled with the `--cache-path <path>` option, or caching can be disabled entirely with the `--disable-cache` option. You can safely delete `igir.cache` when `igir` isn't running if the file becomes too large for you.
