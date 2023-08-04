# Batocera

[Batocera](https://batocera.org/) is a pre-configured Linux distribution for [EmulationStation](https://emulationstation.org/) & [RetroArch](https://www.retroarch.com/). Batocera is primarily for single-board computers (SBCs) such as the [Raspberry Pi](https://www.raspberrypi.com/).

## BIOS

Because Batocera uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the [Batocera BIOS directory](https://wiki.batocera.org/add_games_bios#adding_bios_files) is `/userdata/bios`:

=== "Batocera (Linux)"

    You can copy BIOS files from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /userdata/bios/
    ```

## ROMs

Batocera has a `roms` folder in the "userdata partition" at `/userdata/roms` that is used by default:

=== "Batocera (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "/userdata/roms/" \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```
