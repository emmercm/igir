# Recalbox

[Recalbox](https://www.recalbox.com/) is a pre-configured Linux distribution for [EmulationStation](https://emulationstation.org/) & [RetroArch](https://www.retroarch.com/).

## BIOS

Because Recalbox uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the [Recalbox BIOS directory](https://wiki.recalbox.com/en/basic-usage/file-management#adding-bios) is `/recalbox/share/bios`:

=== "Recalbox (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /recalbox/share/bios
    ```

## ROMs

Recalbox has a `roms` folder at `/recalbox/share/roms` that is used by default:

=== "Recalbox (Linux)"

    You can copy ROMs from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy zip test clean \
      --dat "/media/USB-Drive/No-Intro*.zip" \
      --input "/media/USB-Drive/ROMs/" \
      --output "/recalbox/share/roms/" \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```
