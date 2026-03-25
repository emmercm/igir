# Commands

Igir takes actions based on commands you specify. Each command has a clear input and output, and Igir will never take surprise actions you did not specify. Multiple commands can (and will likely) be specified at once.

!!! tip

    See the `igir --help` message for the list of all commands and options, as well as some examples.

## ROM writing

Igir has three writing commands. Only one writing command can be specified at a time, and all require at least one [`--input <path|glob>`](roms/scanning.md) and a [`--output <path>`](output/path-options.md).

### `copy`

Copy files from an input directory to the output directory.

Files in the input directories will be left alone, they will _not_ be modified or deleted.

### `move`

Move files from an input directory to the output directory. The same directory can be specified for both input & output, resulting in ROMs being renamed as their filenames change in [DATs](dats/introduction.md).

!!! note

    The `igir move` command will only delete the source file in the input directory if it's safe to do so. This includes:

    - `igir move` newly writes a file in the output directory.
    - [`igir move test`](#test) newly writes a file in the output directory, and the file is validated successfully.
    - [`igir move --overwrite`](output/options.md#overwriting-files) overwrites an existing file in the output directory.
    - [`igir move --overwrite-invalid`](output/options.md#overwriting-files) successfully validates an existing file; or it overwrites an existing file in the output directory.

!!! note

    Input files that need to be moved to multiple locations in the output directory (because of multiple [DATs](dats/processing.md), [output tokens](output/tokens.md), or any other reason) will be duplicated as needed.

### `link`

Create a link in the output directory to a file in the input directory.

Three different types of links can be created:

| Link mode                                              | Description                                                                                                                                                                                                                                      | What happens when the source file is deleted                                             |
|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Hard link<br><br>`--link-mode hardlink` (default)      | The link file and source file are the exact same file on disk. If either file is changed, then all other hard linked files will also reflect those changes.<br><br><i>Supported by most filesystems other than FAT, FAT16, FAT32, and exFAT.</i> | ✅ The linked file isn't changed in any way.                                              |
| Symbolic link ("symlink")<br><br>`--link-mode symlink` | The link file is a shortcut to the source file. Symlinks generally require administrator privileges on Windows.<br><br><i>Supported by most filesystems other than FAT, FAT16, FAT32, and exFAT.</i>                                             | ❌ The linked file's shortcut is broken, which will cause issues with reading or writing. |
| Reflink (copy-on-write)<br><br>`--link-mode reflink`   | The link file and source file will be the same file on disk, _until_ any data is changed in the linked file, at which point the source file is copied to the link location.<br><br><i>Supported by APFS (macOS) and some Linux filesystems.</i>  | ✅ The linked file isn't changed in any way.                                              |

## ROM extracting & zipping

Igir has two ROM archive commands. Archive commands require either the `copy` or `move` write command. Only one archive command can be specified at a time.

If no archive command is specified, then files will be left as-is. If they are already extracted, then they will stay extracted. If they are already archived (including non-`.zip` archives), then they will stay archived in their original format.

!!! note

    See the [archives page](input/reading-archives.md) for more information on supported archive types.

### `extract`

ROMs will be extracted from archives when they are being copied or moved. ROMs from the same game will be placed into a subdirectory together by default (see the [`--dir-game-subdir <mode>` option](output/path-options.md#append-the-game-name)).

Input ROMs that are _not_ already archived will be copied as-is, as they have no need to be extracted.

### `zip`

ROMs will be archived into a `.zip` file as they are being copied or moved. ROMs from the same game will be put into the same `.zip` file.

!!! note

    Igir will make its best effort to find any already-valid `.zip` files in an input path and copy those as-is without re-zipping.

    Any invalid `.zip` files (ones that would fail [`igir test`](#test)), and any non-`.zip` files, will be re-zipped into a valid `.zip` file.

!!! note

    You can use the [`--dat-combine` option](dats/processing.md#dat-combining) to cause every ROM in a DAT to be zipped together.

## ROM verification

### `test`

If a writing command (above) is also provided, verify that each file was written correctly:

- `igir extract test` tests that each ROM file written has the correct size and checksum.
- `igir zip test` tests that the `.zip` file is a valid [TorrentZip/RVZSTD](output/writing-archives.md#torrentzip) archive, has all the correct archive entry sizes & checksums, and contains no excess entries.

If a writing command is not provided, then verify that each input file is valid.

## DAT writing

### `dir2dat`

Creates a DAT from scanned ROM files. See the [dir2dat page](dats/dir2dat.md) for more information.

### `fixdat`

Creates a DAT from missing ROM files. See the [fixdat page](dats/fixdats.md) for more information.

## File manipulation

### `clean`

Files in the output directory that do not [match any ROM](roms/matching.md) in any [DAT](dats/introduction.md) will be deleted.

See the [output cleaning page](output/cleaning.md) for more information.

## Other files

### `report`

A report will be generated of what [input files were matched](roms/matching.md) by what [DAT](dats/introduction.md), and what games in what DATs have missing ROMs.

See the [reporting page](output/reporting.md) for more information.

### `playlist`

Create `.m3u` playlist files for multi-disc games. See the [playlists page](output/playlists.md) for more information.
