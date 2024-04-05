# ES-DE

## EmulationStation Desktop Edition (ES-DE)

[ES-DE](https://emulationstation.org/) is a frontend for [RetroArch](retroarch.md) and many other standalone emulators.

## BIOS

Because ES-DE uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the ES-DE BIOS directory is `/userdata/bios/`:

=== ":simple-linux: ES-DE (Linux)"

    You can copy BIOS files from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /userdata/bios/
    ```

Other emulators may use other names for their BIOS images but all reside in the same BIOS directory.

## ROMs

ES-DE uses its own proprietary ROM folder structure, so `igir` has a replaceable `{es-de}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-linux: ES-DE (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "/userdata/roms/{es-de}" \
      --no-bios
    ```
