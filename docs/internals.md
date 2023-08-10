# igir Internals

Information about the inner workings of `igir`.

## Order of operations

`igir` runs these steps in the following order:

1. Scan each DAT input path for every file and parse them, if provided (`--dat`)
2. Scan each ROM input path for every file (`--input`)
   - Detect headers in those files, if applicable (see [header docs](roms/headers.md))
3. Scan each patch input path for every file (`--patch`) (see [patching docs](roms/patching.md))
4. Then for each DAT:
   - ROMs in the DAT are filtered to only those desired (see [filtering & preference docs](roms/filtering-preferences.md))
   - Input files are matched to ROMs in the DAT
   - Patch files are matched to ROMs in the DAT
   - ROM preferences are applied (`--single`, see [filtering & preference docs](roms/filtering-preferences.md))
   - ROMs are written to the output directory, if specified (`copy`, `move`, `symlink`)
     - Written ROMs are tested for accuracy, if specified (`test`)
   - A "fixdat" is created, if specified (`fixdat`)
5. "Moved" input ROMs are deleted (`move`)
6. Unknown files are recycled from the output directory, if specified (`clean`)
7. An output report is written to the output directory, if specified (`report`)
