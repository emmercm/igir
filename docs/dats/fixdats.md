# Writing Fixdats

"Fixdats" are DATs that contain only ROMs that are missing from your collection. Fixdats are derived from some other DAT (see the [DATs introduction docs](introduction.md) for how to obtain DATs), containing only a subset of its ROMs. Fixdats are specific to the state of each person's ROM collection, so they aren't necessarily meaningful to other people.

Fixdats help you find files missing from your collection, and they can be used to generate a collection of those files once you've found them. This sub-collection of files can then be merged back into your main collection.

The `fixdat` command creates a [Logiqx XML](http://www.logiqx.com/DatFAQs/) DAT for every input DAT (the [`--dat <path|glob|url>` option](scanning.md)) that is missing ROMs. Fixdats will be written to the first matching directory in this list:

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
      --input ROMs ^
      --output ROMs-Sorted
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip fixdat \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs \
      --output ROMs-Sorted
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip fixdat \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs \
      --output ROMs-Sorted
    ```

This command will produce a fixdat file in the `ROMs-Sorted/` directory for each of the three input DATs that have at least one ROM that wasn't found in the `ROMs/` input directory:

```text
ROMs-Sorted/
├── Nintendo - Game Boy (20230414-173400) fixdat.dat
├── Nintendo - Game Boy Advance (20230414-173400) fixdat.dat
└── Nintendo - Game Boy Color (20230414-173400) fixdat.dat
```

!!! info

    Fixdats are affected by [filter](../roms/filtering.md) & [1G1R](../roms/1g1r.md) options. This is because those options are applied to all DATs _before_ [ROM matching](../roms/matching.md) happens.

## Without input files

The `fixdat` command doesn't require the [`--input <path|glob>` option](../roms/scanning.md), which allows for some lightweight DAT creation functionality. Below are some examples of what you can achieve.

!!! example

    Generate a DAT of retail Nintendo 64 games that were only released in Japan (requires two steps):

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir fixdat ^
          --dat "No-Intro*.zip" ^
          --dat-name-regex "/Nintendo 64/i" ^
          --single ^
          --prefer-region USA,EUR,JPN ^
          --only-retail ^
          --fixdat-output N64-1G1R.dat

        igir fixdat ^
          --dat N64-1G1R.dat ^
          --filter-region JPN ^
          --fixdat-output N64-JPN.dat

        del N64-1G1R.dat
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir fixdat \
          --dat "No-Intro*.zip" \
          --dat-name-regex "/Nintendo 64/i" \
          --single \
          --prefer-region USA,EUR,JPN \
          --only-retail \
          --fixdat-output N64-1G1R.dat

        igir fixdat \
          --dat N64-1G1R.dat \
          --filter-region JPN \
          --fixdat-output N64-JPN.dat

        rm N64-1G1R.dat
        ```

    === ":simple-linux: Linux"

        ```shell
        igir fixdat \
          --dat "No-Intro*.zip" \
          --dat-name-regex "/Nintendo 64/i" \
          --single \
          --prefer-region USA,EUR,JPN \
          --only-retail \
          --fixdat-output N64-1G1R.dat

        igir fixdat \
          --dat N64-1G1R.dat \
          --filter-region JPN \
          --fixdat-output N64-JPN.dat

        rm N64-1G1R.dat
        ```

!!! example

    Generate a [split set](../usage/arcade.md#rom-set-merge-types) DAT of non-bootleg arcade games:

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir fixdat ^
          --dat "mame*.xml" ^
          --merge-roms split ^
          --only-retail
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir fixdat \
          --dat "mame*.xml" \
          --merge-roms split \
          --only-retail
        ```

    === ":simple-linux: Linux"

        ```shell
        igir fixdat \
          --dat "mame*.xml" \
          --merge-roms split \
          --only-retail
        ```
