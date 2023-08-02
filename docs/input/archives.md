# Archives

`igir` supports scanning the contents of archives for ROMs, DATs, and ROM patches.

## Supported archive types for writing

`igir` only supports creating `.zip` archives, which is why the command is `igir zip`.

`.zip` archives store CRC32 information in the file table (see below) which helps drastically speed up file scanning, and they are easy to create without proprietary tools (e.g. Rar).

## Supported archive types for reading

`igir` supports most common archive formats:

| Extension                | Contains file CRC32s | `igir` can extract natively |
|--------------------------|----------------------|-----------------------------|
| `.7z`                    | ✅                    | ❌                           |
| `.gz`, `.gzip`           | ❌ CRC16              | ❌                           |
| `.rar`                   | ✅                    | ❌                           |
| `.tar`                   | ❌                    | ✅                           |
| `.tar.gz`, `.tgz`        | ❌                    | ✅                           |
| `.z01`                   | ✅                    | ❌                           |
| `.zip` (including zip64) | ✅                    | ✅                           |
| `.zip.001`               | ✅                    | ❌                           |
| `.zipx`                  | ✅                    | ❌                           |

**You should prefer archive formats that have CRC32 checksum information for each file.**

`igir` uses CRC32 information to match ROMs to DAT entries. If an archive already contains CRC32 information for each file, then `igir` won't need to extract each file and compute its CRC32 itself. This can save a lot of time on large files especially.

This is why you should use the `igir zip` command when organizing your primary ROM collection. It is much faster to scan archives with CRC32 information, speeding up actions such as merging new ROMs into an existing collection.

**You should prefer archive formats that `igir` can extract natively.**

Somewhat proprietary archive formats such as `.7z` and `.rar` require `igir` to use an external tool to enumerate and extract files. This can greatly slow down processing speed.

This is why `igir` uses `.zip` as its output archive of choice, `.zip` files are easy and fast to read, even if they can't offer as high of compression as other formats.
