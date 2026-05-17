# muOS

[muOS](https://muos.dev/) (MustardOS) is a custom firmware for several Anbernic and TrimUI handhelds. It aims to be configurable, themeable, and easy to use, and it ships with a wide selection of [emulator cores](https://muos.dev/systems/cores) covering 70+ systems.

## BIOS

Because muOS uses RetroArch under the hood, the instructions are generally the [same as RetroArch](../desktop/retroarch.md). By default, the muOS BIOS directory is `/MUOS/bios/`:

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS ^
      --output E:\MUOS\bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/muOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /Volumes/muOS/MUOS/bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/muOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /media/muOS/MUOS/bios
    ```

## ROMs

For ROMs, muOS "does not enforce strict naming conventions, allowing you to name and structure your folders however you prefer, including nested folders for organization." Because of that flexibility, Igir does not provide a muOS-specific output token.

You can still let Igir organize ROMs by system using the DAT name with the [`--dir-dat-name` option](../../output/path-options.md#append-dat-name):

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs ^
      --output E:\ROMS ^
      --dir-dat-name ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/muOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output /Volumes/muOS/ROMS \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/muOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output /media/muOS/ROMS \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```
