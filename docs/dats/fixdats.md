# Writing Fixdats

"Fixdats" are DATs that contain only ROMs that are missing from your collection. Fixdats are derived from some other DAT (see the [DATs introduction docs](introduction.md) for how to obtain DATs), containing only a subset of the ROMs. Fixdats are specific to the state of each person's ROM collection, so they aren't necessarily meaningful to other people.

Fixdats help you find files missing from your collection, and they can be used to generate a collection of those files once you've found them. This sub-collection of files can then be merged back into your main collection.

The `fixdat` command creates a [Logiqx XML](http://www.logiqx.com/DatFAQs/) DAT for every input DAT (the [`--dat <path>` option](./processing.md#scanning-for-dats)) that is missing ROMs. Fixdats will be written to the first matching directory in this list:

1. If provided: the `--fixdat-output <path>` directory
2. When writing ROMs (one of the `copy`, `move`, or `link` [commands](../commands.md)): the `--output <path>` directory
3. Otherwise: the CLI working directory

Example usage:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip fixdat ^
      --dat "Nintendo - Game Boy.dat" ^
      --dat "Nintendo - Game Boy Advance.dat" ^
      --dat "Nintendo - Game Boy Color.dat" ^
      --input ROMs\ ^
      --output ROMs-Sorted\ ^
      --fixdat
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip fixdat \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip fixdat \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/
    ```

may produce some fixdats in the `ROMs-Sorted/` directory, if any of the input DATs have ROMs that weren't found in the `ROMs/` input directory:

```text
ROMs-Sorted/
├── Nintendo - Game Boy (20230414-173400) fixdat.dat
├── Nintendo - Game Boy Advance (20230414-173400) fixdat.dat
└── Nintendo - Game Boy Color (20230414-173400) fixdat.dat
```

!!! info

    Fixdats are affected by [filter & preference (1G1R) options](../roms/filtering-preferences.md). This is because those options are applied to all DATs _before_ [ROM matching](../roms/matching.md) happens.
