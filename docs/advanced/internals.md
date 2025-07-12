# Internal Operations

Information about the inner workings of Igir.

## Order of operations

Igir runs these steps in the following order:

1. Scan each DAT input path for every file and parse them, if provided (`--dat <path>`)
2. Scan each ROM input path for every file (`--input <path>`)
   - Detect headers in those files, if applicable (see [header docs](../roms/headers.md))
   - Detect trimming of those files, if applicable (see [trimming docs](../roms/trimming.md))
3. Scan each patch input path for every file (`--patch <path>`) (see [patching docs](../roms/patching.md))
4. Then for each DAT:
   - Parent/clone information is inferred if the DAT has none (see [DATs docs](../dats/processing.md#parentclone-inference))
   - Parent/clone ROMs sets are merged or split (`--merge-roms <type>`) (see [arcade docs](../usage/arcade.md))
   - Multi-disc games are merged (`--merge-discs`) (see [ROM set docs](../roms/sets.md))
   - ROMs in the DAT are filtered to only those desired (`--filter-*` options) (see [filtering & preference docs](../roms/filtering-preferences.md))
   - ROMs in the DAT are filtered to the preferred clone (`--single`, see [filtering & preference docs](../roms/filtering-preferences.md#preferences-for-1g1r))
   - Input files are matched to ROMs in the DAT (see [matching docs](../roms/matching.md))
   - Patch files are matched to ROMs found (see [patching docs](../roms/patching.md))
   - ROMs without a potentially bad extension have their extension corrected using its file signature
   - ROM archives that aren't being extracted have their checksums calculated
   - ROMs are combined (`--zip-dat-name`)
   - ROMs are written to the output directory, if specified (`copy`, `move`, `link`)
     - Written ROMs are tested for accuracy, if specified (`test`)
   - A "dir2dat" DAT is created, if specified (`dir2dat`) (see [dir2dat docs](../dats/dir2dat.md))
   - A "fixdat" is created, if specified (`fixdat`) (see [fixdats docs](../dats/fixdats.md))
5. Leftover "moved" input ROMs are deleted (`move`)
6. Unknown files are recycled from the output directory, if specified (`clean`, see [cleaning docs](../output/cleaning.md))
7. An output report is written to the output directory, if specified (`report`, see [reporting docs](../output/reporting.md))
