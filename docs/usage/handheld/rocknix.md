# ROCKNIX

[ROCKNIX](https://rocknix.org) is a community-driven, open-source operating system for many handheld devices from Anbernic, Powkiddy, Hardkernel, and others. It is the successor to [JELOS](https://jelos.org) (which is no longer actively maintained).

## Different card setups

### OS card, ROM card

ROCKNIX can be installed on single SD card devices as well as devices using a secondary SD card for games. In normal operation, the external SD card will be mounted under `/roms`. Please keep that in mind and adapt accordingly when following these instructions.

We will assume the single card variant here. If you use a card just for roms, please remove the `roms/` path component when writing to your SD card as follows:

| Component     | single SD card (OS+ROMs) | separate SD card (ROMs only) |
|---------------|--------------------------|------------------------------|
| BIOS          | `<SD>/roms/bios/`        | `<SD>/bios/`                 |
| Game Boy ROMs | `<SD>/roms/gb`           | `<SD>/gb`                    |
| ...           |                          |                              |

The OS can also be installed on other media than SD cards. Still we will call them OS SD card and ROM SD card.

### Filesystems

ROCKNIX, being a Linux distribution, runs from a Linux filesystem. Most Linux filesystems can not be read from or written to natively using Windows or macOS. When using a single SD card setup, you might need to access partitions of the card using a Linux filesystem (probably `ext4`). This is easiest using the Network functions of ROCKNIX via Wi-Fi, another system running the Linux operating system or special software.

When using a separate card for ROMs and OS, the ROMs are most likely stored in a `FAT32` filesystem which can be accessed using either Windows, macOS or Linux natively.

Please note that while `FAT32` is not case-sensitive in most cases, `ext4` and many other filesystems are. Keep that in mind while copying.

## BIOS

ROCKNIX has its BIOS folder at `roms/bios/`, and it uses the RetroArch filenames. Most of the BIOS files should be found using the following guides. Check the many sections under the `Systems` menu in the [ROCKNIX Wiki](https://rocknix.org/) for more precise instructions when you run into trouble.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS ^
      --output E:\roms\bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/ROCKNIX` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /Volumes/ROCKNIX/roms/bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/ROCKNIX` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS \
      --output /media/ROCKNIX/roms/bios
    ```

## ROMs

ROCKNIX supports many many systems and ROM formats. Check sections under the `Systems` menu in the [ROCKNIX Wiki](https://rocknix.org/) for more precise instructions about the individual systems. Most supported systems and their ROMs can be automatically sorted by Igir using the `{rocknix}` output token. See the [replaceable tokens page](../../output/tokens.md) for more information.

!!! note

    Because ROCKNIX is the successor to JELOS and uses the same folder structure, the `{jelos}` token is still accepted as an alias of `{rocknix}` and behaves identically.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs ^
      --output "E:\roms\{rocknix}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/ROCKNIX` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output "/Volumes/ROCKNIX/roms/{rocknix}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/ROCKNIX` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs \
      --output "/media/ROCKNIX/roms/{rocknix}" \
      --dir-letter \
      --no-bios
    ```
