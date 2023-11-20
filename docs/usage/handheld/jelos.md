# JELOS

!!! info

    [JELOS](https://jelos.org) is based on [RetroArch](https://www.retroarch.com/) and [EmulationStation](https://emulationstation.org/). If the instructions on this page don't lead to success on your device, you might want to try your luck with their documentation.

[JELOS](https://jelos.org) (or **J**ust **E**nough **L**inux **OS**) is a slim open source operating system for many devices by Anbernic, Powkiddy, Hardkernel etc. While it supports many devices as an aftermarket operating system choice, vendors have started shipping their devices with JELOS, too. With powerful features like custom collections and online scraping, it can make good use of huge and well managed ROM collections.

## Different card setups

### OS card, ROM card

JELOS can be installed on single SD card devices as well as devices using a secondary SD card for games. In normal operation, the external SD card will be mounted under `/roms`. Please keep that in mind and adapt accordingly when following these instructions.

We will assume the single card variant here. If you use a card just for roms, please remove the `roms/` path component when writing to your SD card as follows:

| Component     | single SD card (OS+ROMs) | separate SD card (ROMs only) |
|---------------|--------------------------|------------------------------|
| BIOS          | `<SD>/roms/bios/`        | `<SD>/bios/`                 |
| GameBoy ROMs  | `<SD>/roms/gb`           | `<SD>/gb`                    |
| ...           |                          |                              |

The OS can also be installed on other media than SD cards. Still we will call them OS SD card and ROM SD card.

### Filesystems

JELOS, being a Linux distribution, runs from a Linux filesystem. most Linux filesystems can not be read from or written to natively using Windows or macOS. When using a single SD card setup, you might need to access partitions of the card using a Linux filesystem (probably `ext4`). This is easiest using the Network functions of JELOS via Wifi, another system running the Linux operating system or special software.

When using a separate card for ROMs and OS, the ROMs are most likely stored in a `FAT32` filesystem which can be accessed using either Windows, macOS or Linux natively.

Please note that while `FAT32` is not case sensitive in most cases, `ext4` and many other filesystems are. Keep that in mind while copying.

## BIOS

JELOS has its BIOS folder at `roms/bios/`, and it uses the RetroArch filenames. Most of the BIOS files should be found using the following guides. Check the many sections under the `Systems` menu in the [JELOS Wiki](https://jelos.org/) for more precise instructions when you run into trouble.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS\ ^
      --output E:\roms\bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/JELOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /Volumes/JELOS/roms/bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/JELOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /media/JELOS/roms/bios
    ```

## ROMs

JELOS supports many many systems and ROM formats. Check sections under the `Systems` menu in the [JELOS Wiki](https://jelos.org/) for more precise instructions about the indivudual systems. Most supported systems and their ROMS can be automatically sorted by `igir` using the `{jelos}` output token. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\roms\{jelos}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/JELOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/JELOS/roms/{jelos}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/JELOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/JELOS/roms/{jelos}" \
      --dir-letter \
      --no-bios
    ```
