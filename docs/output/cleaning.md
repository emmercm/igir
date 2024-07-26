# Output Directory Cleaning

The `igir clean` [command](../commands.md) can be used when writing (`igir copy`, `igir move`, and `igir link`) to delete files from the `--output <path>` directory that are either:

- Not contained in any provided [DAT](../dats/introduction.md) (the [`--dat <path>` option](../dats/processing.md#scanning-for-dats)).
- Contained in a [DAT](../dats/introduction.md) (the [`--dat <path>` option](../dats/processing.md#scanning-for-dats)), but the file is in the incorrect location.

## The golden rule

The golden rule of the `igir clean` command is it will _not_ delete files in any directory tree that it did not write to.

In practical terms, this means:

**1. If no file was written (i.e. no input file matched any ROM in any [DAT](../dats/introduction.md)), then `igir clean` will not delete any files.**

**2. If [tokens](tokens.md) are used with the `--output <path>` option, only subdirectories that are written to will be considered for cleaning.**

For example, if the output directory is specified as `--output "games/{mister}"`, and only Game Boy Color games are found in `--input <path>`, then only the `games/Gameboy/` directory would be considered for cleaning. Other directories that may already exist such as `games/GBA/` and `games/NES/` would _not_ be considered for cleaning, as `igir` did not write there.

In other words, `games/{mister}` is _not_ equivalent to `games/*`. `igir` will _not_ indiscriminately delete files in `games/`.

If you want to clean _every_ directory in `games/`, you could specify it as both the `--input <path>` and `--output <path>`:

=== ":simple-windowsxp: Windows"

    ```batch
    igir move clean --dat "*.dat" --input "games\" --output "games\{mister}\"
    ```

=== ":simple-apple: macOS"

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

By default, `igir` will recycle cleaned files, and if recycle fails then it will delete them. This is potentially destructive, so a `--clean-backup <path>` option is provided to instead move files to a backup directory.

The input directory structure is not maintained, no subdirectories will be created in the backup directory. Files of conflicting names will have a number appended to their name, e.g. `File (1).rom`.

## Dry run

The `--clean-dry-run` option exists to see what paths `igir clean` would delete, without _actually_ deleting them.

!!! note

    You will want to set the [log level](../advanced/logging.md) to at least DEBUG (`-vv`) in order to see actions that were skipped, such as cleaning.

Usage:

=== ":simple-windowsxp: Windows"

    ```batch
    igir [commands..] clean [options] --clean-dry-run -vv
    ```

=== ":simple-apple: macOS"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -vv
    ```

=== ":simple-linux: Linux"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -vv
    ```
