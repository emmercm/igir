# Advanced Topics

Information about the inner workings of `igir`.

## Order of operations

`igir` runs these steps in the following order:

1. Scans each DAT input path for every file and parses them, if provided (`--dat`)
2. Scans each ROM input path for every file (`--input`)
   - Then detects headers in those files, if applicable (see [header docs](docs/rom-headers.md))
3. Scans each patch input path for every file (`--patch`) (see [patching docs](docs/rom-patching.md))
4. ROMs are matched to the DATs, if provided
   - Then ROMs are matched to any applicable patches, creating multiple versions from the same ROM
   - Then filtering and sorting options are applied (see [filtering docs](docs/rom-filtering.md))
   - Then ROMs are written to the output directory, if specified (`copy`, `move`)
   - Then written ROMs are tested for accuracy, if specified (`test`)
   - Then input ROMs are deleted, if specified (`move`)
5. Unknown files are recycled from the output directory, if specified (`clean`)
6. An output report is written to the output directory, if specified (`report`)

## Supported archive formats

`igir` supports most common archive formats:

| Extension                | Includes file CRC32 | Can extract natively |
|--------------------------|---------------------|----------------------|
| `.7z`                    | ✅                   | ❌                    |
| `.gz`, `.gzip`           | ❌ CRC16             | ❌                    |
| `.rar`                   | ✅                   | ❌                    |
| `.tar`                   | ❌                   | ✅                    |
| `.tar.gz`, `.tgz`        | ❌                   | ✅                    |
| `.z01`                   | ✅                   | ❌                    |
| `.zip` (including zip64) | ✅                   | ✅                    |
| `.zip.001`               | ✅                   | ❌                    |
| `.zipx`                  | ✅                   | ❌                    |

**You should prefer archive formats that have CRC32 checksum information for each file.**

`igir` uses CRC32 information to match ROMs to DAT entries. If an archive already contains CRC32 information for each file, then `igir` won't need to extract each file and compute its CRC32 itself. This can save a lot of time on large files especially.

This is why you should use the `igir zip` command when organizing your primary ROM collection. It is much faster to scan archives with CRC32 information, speeding up actions such as merging new ROMs into an existing collection.

**You should prefer archive formats that `igir` can extract natively.**

Somewhat proprietary archive formats such as `.7z` and `.rar` require `igir` to use an external tool to enumerate and extract files. This can greatly slow down processing speed.

This is why `igir` uses `.zip` as its output archive of choice, `.zip` files are easy and fast to read, even if they can't offer as high of compression as other formats.
