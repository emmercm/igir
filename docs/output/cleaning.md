# Output Directory Cleaning

The `igir clean` [command](../commands.md) can be used when writing (`igir copy`, `igir move`, and `igir link`) to delete files from the [`--output <path>` directory](path-options.md#base-output-directory) that are not valid according to the provided Igir options.

When using [DATs](../dats/processing.md), these files will be deleted from the output directory:

- Files that do not match any ROM in any DAT.
- Files that match a ROM in a DAT, but do not have the correct directory & filename.
- Files that match a ROM in a DAT, but were excluded due to [filtering](../roms/filtering-preferences.md#filters) or [1G1R](../roms/filtering-preferences.md#preferences-for-1g1r) options.

!!! note

    When cleaning, Igir will need to scan all files in the output directory, in addition to the input directories. This is necessary to match these files to DATs, and it is done automatically.

!!! warning

    Scanned output files will _not_ be used as a source file for any writing command. If you use a new DAT with an existing collection, and that DAT changed some of the ROM names, then files with the old name may be deleted during cleaning.

    To prevent this, you can provide the output directory as an `--input <path>` as well. Then files in the output directory can be used as a source file during writing. This is particularly useful with the `igir move` command, which will rename files in the output directory to the correct names, which will preclude them from cleaning.

    When in doubt, you can provide the [`--clean-dry-run` option](#dry-run) to see what files would be deleted without actually deleting them.

## The golden rule

The golden rule of the `igir clean` command is it will _not_ delete files in any directory tree that it did not write to.

In practical terms, this means:

1. **If no file was written (i.e. no input file matched any ROM in any [DAT](../dats/introduction.md)), then `igir clean` will not delete any files.**

    This helps prevent accidental destruction of your ROM collection.

2. **If [tokens](tokens.md) are used with the `--output <path>` option, only subdirectories that are written to will be considered for cleaning.**

    For example, if you have a collection of many different consoles, but are only merging in new Game Boy ROMs:

  === ":fontawesome-brands-windows: Windows"

      ```batch
      igir move clean ^
        --dat "*.dat" ^
        --input "ROMs-Sorted" ^
        --input "GB-ROMs" ^
        --output "ROMs-Sorted\{datName}"
      ```

  === ":fontawesome-brands-apple: macOS"

      ```shell
      igir move clean \
        --dat "*.dat" \
        --input "ROMs-Sorted" \
        --input "GB-ROMs" \
        --output "ROMs-Sorted/{datName}"
      ```

  === ":simple-linux: Linux"

      ```shell
      igir move clean \
        --dat "*.dat" \
        --input "ROMs-Sorted" \
        --input "GB-ROMs" \
        --output "ROMs-Sorted/{datName}"
      ```

    then only the `ROMs-Sorted/Game Boy` directory (or whatever your DAT is named) will be considered for cleaning.

  !!! warning

      Note that `--output "ROMs-Sorted" --dir-dat-name` and `--output "ROMs-Sorted/{datName}"` are different in this regard. If your output is `--output "ROMs-Sorted"`, then the entire `ROMs-Sorted` directory will be considered for cleaning. This is true for all [`--dir-*` options](path-options.md).

## Exclusions

The `--clean-exclude <path>` option exists so that one or more paths (with support for [globbing](../input/file-scanning.md)) can be excluded from deletion.

See the [Analogue Pocket](../usage/hardware/analogue-pocket.md) page for a practical example.

## Backing up cleaned files

By default, Igir will recycle cleaned files, and if recycling fails, then it will delete them. This is potentially destructive, so a `--clean-backup <path>` option exists to instead move files to a backup directory.

The input directory structure is not maintained, no subdirectories will be created in the backup directory. Files of conflicting names will have a number appended to their name, e.g. `File (1).rom`.

## Dry run

The `--clean-dry-run` option exists to see what paths `igir clean` would delete, without _actually_ deleting them.

!!! note

    You will want to set the [log level](../advanced/logging.md) to at least INFO (`-v`) in order to see actions that were skipped, such as cleaning.

Usage:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir [commands..] clean [options] --clean-dry-run -v
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -v
    ```

=== ":simple-linux: Linux"

    ```shell
    igir [commands..] clean [options] --clean-dry-run -v
    ```
