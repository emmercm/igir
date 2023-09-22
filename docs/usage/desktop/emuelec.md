# EmuELEC

[EmuELEC](https://github.com/EmuELEC/EmuELEC) is an OS for Amlogic devices (Android TV boxes, ODROID) based on CoreELEC, [Lakka](lakka.md), and [Batocera](batocera.md).

## BIOS

Because EmuELEC is mostly Libretro under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, EmuELEC has its [BIOS directory](https://github.com/EmuELEC/EmuELEC/wiki/bios) at `/storage/roms/bios/`:

=== ":simple-linux: EmuELEC (Linux)"

    You can copy BIOS files from a USB drive named "USB-Drive" like this:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input /media/USB-Drive/BIOS/ \
      --output /storage/roms/bios/
    ```

## ROMs

!!! failure

    EmuELEC uses its own proprietary [ROM folder structure](https://github.com/EmuELEC/EmuELEC/wiki/Supported-Platforms-And--Correct-Rom-Path). `igir` does not support this folder structure, yet.
