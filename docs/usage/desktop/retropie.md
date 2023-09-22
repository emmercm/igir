# RetroPie

[RetroPie](https://retropie.org.uk/) is an installer for [EmulationStation](emulationstation.md) & [RetroArch](retroarch.md) on single-board computers (SBCs) such as the [Raspberry Pi](https://www.raspberrypi.com/).

## BIOS

Because RetroPie uses RetroArch under the hood, the instructions are generally the [same as RetroArch](retroarch.md). By default, the RetroPie BIOS directory is `/home/pi/RetroPie/BIOS/`:

=== ":simple-linux: RetroPie (Linux)"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /home/pi/RetroPie/BIOS
    ```

## ROMs

The [RetroPie docs](https://retropie.org.uk/docs/Transferring-Roms/) recommend creating a `retropie/roms` directory at the root of a USB drive. You can then load up this USB drive with your ROMs from a different computer:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy zip test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs" ^
      --output "E:\retropie\roms" ^
      --dir-dat-name ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/RETROPIE` drive name with whatever your SD card is named:

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "/Volumes/RETROPIE/retropie/roms/" \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/RETROPIE` path with wherever your SD card is mounted:

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "/media/RETROPIE/retropie/roms/" \
      --dir-dat-name \
      --dir-letter \
      --no-bios
    ```
