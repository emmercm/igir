# Output Cleaning

The `igir clean` [command](../commands.md) can be used when writing (`igir copy`, `igir move`, and `igir symlink`) to delete files from the `--output <path>` directory that are either:

- Not contained in any provided [DAT](../input/dats.md) (the `--dat <path>` option).
- Contained in a [DAT](../input/dats.md) (the `--dat <path>` option), but the file is in the incorrect location.

## The golden rule

The golden rule of the `igir clean` command is it will _not_ delete files in any directory tree that it did not write to.

In practical terms, this means:

**1. If no file was written (i.e. no input file matched any ROM in any [DAT](../input/dats.md)), then `igir clean` will not delete any files.**

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
