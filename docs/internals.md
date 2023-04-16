# Internals

Information about the inner workings of `igir`.

## Order of operations

`igir` runs these steps in the following order:

1. Scans each DAT input path for every file and parses them, if provided (`--dat`)
2. Scans each ROM input path for every file (`--input`)
   - Then detects headers in those files, if applicable (see [header docs](rom-headers.md))
3. Scans each patch input path for every file (`--patch`) (see [patching docs](rom-patching.md))
4. ROMs are matched to the DATs, if provided
   - Then ROMs are matched to any applicable patches, creating multiple versions from the same ROM
   - Then filtering and sorting options are applied (see [filtering docs](rom-filtering.md))
   - Then ROMs are written to the output directory, if specified (`copy`, `move`)
   - Then written ROMs are tested for accuracy, if specified (`test`)
   - Then input ROMs are deleted, if specified (`move`)
5. Unknown files are recycled from the output directory, if specified (`clean`)
6. An output report is written to the output directory, if specified (`report`)
