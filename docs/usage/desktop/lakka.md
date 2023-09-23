# Lakka

[Lakka](https://www.lakka.tv/) is a pre-configured Linux distribution based on [LibreELEC](https://libreelec.tv/) that comes with [RetroArch](retroarch.md) installed. Lakka is primarily for single-board computers (SBCs) such as the [Raspberry Pi](https://www.raspberrypi.com/).

## BIOS

Because Lakka uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the [Lakka BIOS directory](https://www.lakka.tv/doc/Accessing-Lakka-filesystem/) is `/storage/system/`:

=== ":simple-linux: Lakka (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /storage/system
    ```

## ROMs

Lakka has a `roms` folder at `/storage/roms/` that is used by default:

=== ":simple-linux: Lakka (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "/storage/roms/" \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```
