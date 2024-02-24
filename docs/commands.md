# Commands

`igir` takes actions based on commands you specify. Each command has a clear input and output, and `igir` will never take surprise actions you did not specify. Multiple commands can (and will likely) be specified at once.

!!! tip

    See the `igir --help` message for the list of all commands and options, as well as some examples.

## ROM writing

`igir` has three writing commands. Only one writing command can be specified at a time, and all require the `--output <path>` option.

### `copy`

Copy ROMs from an input directory to the output directory.

Files in the input directories will be left alone, they will _not_ be modified or deleted.

### `move`

Move ROMs from an input directory to the output directory. The same directory can be specified for both input & output, resulting in ROMs being renamed as their names change in [DATs](dats/introduction.md).

ROMs will be deleted from their input directory after _all_ ROMs for _every_ [DAT](dats/introduction.md) have been written.

### `link`

Create a link in the output directory to a ROM in the input directory.

By default, hard links are created, similar to [ln(1)](https://linux.die.net/man/1/ln). Use the `--symlink` option to create symbolic links.

## ROM archiving

`igir` has two ROM archive commands. Archive commands require either the `copy` or `move` write command. Only one archive command can be specified at a time.

If no archive command is specified, files will be left as-is. If they are already extracted, then they will stay extracted. If they are already archived (including non-`.zip` archives), then they will stay archived.

!!! note

    See the [archives page](input/reading-archives.md) for more information on supported archive types.

### `extract`

ROMs will be extracted from archives as they are being copied or moved. ROMs from the same game will be placed into a subdirectory together.

Input ROMs that are _not_ archived will be copied as-is.

### `zip`

ROMs will be archived into a `.zip` file as they are being copied or moved. ROMs from the same game will be put into the same `.zip` file.

ROMs that are already in an archive will be re-archived.

## ROM verification

### `test`

After performing one of the ROM writing commands, verify that the file was written correctly.

- `extract test` tests that each ROM file written has the correct size & checksum
- `zip test` tests that the `.zip` file has all the correct archive entry sizes & checksums, and contains no excess entries

## File manipulation

### `clean`

Files in the output directory that do not match any ROM in any [DAT](dats/introduction.md) will be deleted.

See the [output cleaning page](output/cleaning.md) for more information.

## ROM reporting

### `report`

A report will be generated of what input files were matched by what DAT, and what games in what [DATs](dats/introduction.md) have missing ROMs.

See the [reporting page](output/reporting.md) for more information.
