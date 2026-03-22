# Output Directory Cleaning

The `igir clean` [command](../commands.md) can be used when writing (`igir copy`, `igir move`, and `igir link`) to delete files from the [`--output <path>` directory](path-options.md) that are not valid according to the provided Igir options.

When using [DATs](../dats/processing.md), these files will be deleted from the output directory:

- Files that do not match any ROM in any DAT.
- Files that match a ROM in a DAT, but do not have the correct directory & filename.
- Files that match a ROM in a DAT, but were excluded due to [filtering](../roms/filtering-preferences.md#filters) or [1G1R](../roms/filtering-preferences.md#preferences-for-1g1r) options.

!!! note

    When cleaning, Igir will need to scan all files in the output directory, in addition to the input directories. This is necessary to match these files to DATs.

!!! warning

    These scanned output files will _not_ be used as a source file for any writing command. If you use a new DAT with an existing collection, and that DAT changed some of the ROM names, then files with the old name may be deleted during cleaning.

    To prevent this, you can provide the output directory as an `--input <path>` as well. Then files in the output directory can be used as a source file during writing. This is particularly useful with the `igir move` command, which will rename files in the output directory to the correct names, which will preclude them from cleaning.

    When in doubt, you can provide the [`--clean-dry-run` option](#dry-run) to see what files would be deleted without actually deleting them.

---




that were _not_ considered for writing.

!!! note

    The term "considered" is used here because output files that already exist won't be [overwritten](options.md#overwriting-files) by default. These output file paths were _considered_ for writing, but then Igir chose _not_ to write them.

Only files from [`--input <path>` directories](../input/file-scanning.md) can be used when writing to the `--output <path>` directory. Therefore, the output files that will be cleaned (because they _weren't_ considered for writing) are files that:

- (When using [DATs](../dats/introduction.md)) Don't [match](../roms/matching.md) any ROM in any DAT
- Were filtered out by [filter options](../roms/filtering-preferences.md#filters)
- Were filtered out by [1G1R preferences](../roms/filtering-preferences.md#preferences-for-1g1r)

## The golden rule

The golden rule of the `igir clean` command is it will _not_ delete files in any directory tree that it did not write to.

In practical terms, this means:

1. **If no file was written (i.e. no input file matched any ROM in any [DAT](../dats/introduction.md)), then `igir clean` will not delete any files.**
2. **If [tokens](tokens.md) are used with the `--output <path>` option, only subdirectories that are written to will be considered for cleaning.**

  !!! warning

      This behavior is different for [`--dir-*` options](path-options.md). For example, if:

      - Your input directory only includes Game Boy (`.gb`) ROMs
        - And you specify the [`--dir-dat-name` option](path-options.md#append-dat-name) such that these ROMs will be written to `<output>/Nintendo - Game Boy/*.gb`
      - And your output directory already has NES ROMs at `<output>/Nintendo - Nintendo Etertainment System/*.nes`
      - And you specify the `igir clean` command

      Then those NES ROMs will be deleted. This is because the entire `--output <path>` will be considered for cleaning, and no tokens were provided.

      When in doubt, you can provide the [`--clean-dry-run` option](#dry-run) to see what files would be deleted without actually deleting them.

For example, if the output directory is specified as `--output "games/{mister}"`, and only Game Boy Color games are found in `--input <path>`, then only the `games/Gameboy/` directory would be considered for cleaning. Other directories that may already exist such as `games/GBA/` and `games/NES/` would _not_ be considered for cleaning, as Igir did not write there.

In other words, `games/{mister}` is _not_ equivalent to `games/*`. Igir will _not_ indiscriminately delete files in `games/`.

If you want to clean _every_ directory in `games/`, you could specify it as both the `--input <path>` and `--output <path>`:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move clean --dat "*.dat" --input "games\" --output "games\{mister}\"
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move clean --dat "*.dat" --input "games/" --output "games/{mister}/"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move clean --dat "*.dat" --input "games/" --output "games/{mister}/"
    ```

## Exclusions

The `--clean-exclude <path>` option exists so that one or more paths (with support for [globbing](../input/file-scanning.md)) can be excluded from deletion.

See the [Analogue Pocket](../usage/hardware/analogue-pocket.md) page for a practical example.

## Backing up cleaned files

By default, Igir will recycle cleaned files, and if recycle fails, then it will delete them. This is potentially destructive, so a `--clean-backup <path>` option is provided to instead move files to a backup directory.

The input directory structure is not maintained, no subdirectories will be created in the backup directory. Files of conflicting names will have a number appended to their name, e.g. `File (1).rom`.

## Dry run

The `--clean-dry-run` option exists to see what paths `igir clean` would delete, without _actually_ deleting them.

!!! note

    You will want to set the [log level](../advanced/logging.md) to at least DEBUG (`-vv`) in order to see actions that were skipped, such as cleaning.

Usage:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir [commands..] clean [options] --clean-dry-run -vv
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -vv
    ```

=== ":simple-linux: Linux"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -vv
    ```
