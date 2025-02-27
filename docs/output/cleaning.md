# Output Directory Cleaning

The `igir clean` [command](../commands.md) can be used when writing (`igir copy`, `igir move`, and `igir link`) to delete files from the `--output <path>` directory that were _not_ considered for writing.

!!! note

    The term "considered" is used here because output files that already exist won't be [overwritten](options.md#overwriting-files) by default. These output file paths were _considered_ for writing, but then Igir chose _not_ to write them.

Only files from [`--input <path>` directories](../input/file-scanning.md) can be used when writing to the `--output <path>` directory. Therefore, the output files that will be cleaned (because they _weren't_ considered for writing) are files that:

- (When using [DATs](../dats/introduction.md)) Don't [match](../roms/matching.md) any ROM in any DAT
- Were filtered out by [filter options](../roms/filtering-preferences.md#filters)
- Were filtered out by [1G1R preferences](../roms/filtering-preferences.md#preferences-for-1g1r)

!!! warning

    Because only input files will be considered for writing to the output directory, you will want your input files to be a superset of your output files. In other words, if a file isn't in your input files, it will be cleaned from your output directory.

    It is a [best practice](../usage/best-practices.md#file-inputs) to include your output directory as an input directory when cleaning files. This will ensure any previously written valid files won't be cleaned.

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
