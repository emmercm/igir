# RetroDECK

[RetroDECK](https://retrodeck.net/) is a self contained application package that uses [ES-DE](es-de.md) as a frontend for [RetroArch](retroarch.md) and many other standalone emulators. It is primarily designed and optimised for the Steam Deck.

## BIOS

Because RetroDECK uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the RetroDECK BIOS directory is `/userdata/bios/`:

=== ":simple-linux: RetroDECK (Linux)"

    You can copy BIOS files from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /userdata/bios/
    ```

Other emulators may use other names for their BIOS images but all reside in the same BIOS directory. RetroDECK has a convenient tool that handles BIOS checks in the bundled RetroDECK Configuration app.

## ROMs

RetroDECK uses its own proprietary ROM folder structure, so `igir` has a replaceable `{retrodeck}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-linux: RetroDECK (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "/userdata/roms/{retrodeck}" \
      --no-bios
    ```
