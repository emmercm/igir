# RetroArch

[RetroArch](https://www.retroarch.com/) is a frontend UI for the [Libretro API](https://www.libretro.com/).

!!! note

    RetroArch is available for a number of devices, including smartphones and consoles. These instructions will only work on desktop OSes, but once your files are organized you can copy them over to your other device.

## BIOS

First, RetroArch needs a number of [BIOS files](https://docs.libretro.com/library/bios/). Thankfully, the libretro team maintains a DAT of these "system" files, so we don't have to guess at the correct filenames.

With `igir`'s support for [DAT URLs](../../dats/overview.md) we don't even have to download the DAT! Locate your "System/BIOS" directory as configured in the RetroArch UI and use it as your output directory:

=== ":simple-windowsxp: Windows (64-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS/ ^
      --output C:\RetroArch-Win64\system
    ```

=== ":simple-windowsxp: Windows (32-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS/ ^
      --output C:\RetroArch-Win32\system
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output ~/Documents/RetroArch/system/
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output ~/Documents/RetroArch/system/
    ```

## ROMs

RetroArch is less opinionated about where your ROMs can live, you have to specify "content" directories during setup in the RetroArch UI.

If you want to store your ROMs in the RetroArch folder, you could co-locate them near your BIOS files:

=== ":simple-windowsxp: Windows (64-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir copy zip test ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output C:\RetroArch-Win64\roms ^
      --dir-dat-name ^
      --no-bios
    ```

=== ":simple-windowsxp: Windows (32-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir copy zip test ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output C:\RetroArch-Win32\roms ^
      --dir-dat-name ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy zip test \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output ~/Documents/RetroArch/roms \
      --dir-dat-name \
      --no-bios
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip test \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output ~/Documents/RetroArch/roms \
      --dir-dat-name \
      --no-bios
    ```

From there, all you should have to do is "[import content](https://docs.libretro.com/guides/import-content/)" in the RetroArch UI.
