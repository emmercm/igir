# CrossMix-OS

[CrossMix-OS](https://github.com/cizia64/CrossMix-OS) is a custom firmware for the [TrimUI Smart Pro](https://trimui.com/) handheld, built on top of the TrimUI stock user interface with refined configurations, additional emulators, and additional apps.

CrossMix-OS uses its own [directory scheme](https://github.com/cizia64/CrossMix-OS/wiki/Emulators) case-sensitive names.

## BIOS

Because CrossMix-OS uses RetroArch under the hood, the instructions are generally the [same as RetroArch](../desktop/retroarch.md). By default, the CrossMix-OS BIOS directory is `/BIOS/`:

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS ^
      --output E:\BIOS
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/CROSSMIX` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /Volumes/CROSSMIX/BIOS
    ```

=== ":simple-linux: Linux"

    Replace the `/media/CROSSMIX` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /media/CROSSMIX/BIOS
    ```

## ROMs

CrossMix-OS uses its own `/Roms` folder structure with case-sensitive names (e.g. `GB`, `FC`, `MD`):

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs ^
      --output "E:\Roms\{crossmix}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/CROSSMIX` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output "/Volumes/CROSSMIX/Roms/{crossmix}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/CROSSMIX` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output "/media/CROSSMIX/Roms/{crossmix}" \
      --dir-letter \
      --no-bios
    ```
