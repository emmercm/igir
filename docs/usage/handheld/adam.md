# The 'Adam' image

[Adam](https://github.com/eduardofilo/RG350_adam_image/wiki/) ([Code](https://github.com/eduardofilo/RG350_adam_image)) is a custom firmware Ingenic JZ4770 chip-based portable emulation consoles. Specifically GCW-Zero, PocketGo2 v1/v2, Anbernic RG350, RG280 and RG300X. It is based on OpenDingux and the SimpleMenu frontend. While it is intended for the named less powerful handhelds, it packs a good and wide selection of emulators. The distribution defines it's own set of ROM folders ([via SimpleMenu](https://github.com/eduardofilo/RG350_adam_image/tree/master/data/local/home/.simplemenu/section_groups)), so it makes use of it's own output token in igir.

## Preparing TF2

When creating your own microSD card for your system, the documentation of the Adam image [requires you](https://github.com/eduardofilo/RG350_adam_image/wiki/En:-3.-Content-installation#external-microsd-format-and-label) to do the following:

- format the card using FAT32
- make sure the filesystem doesn't have a label
- insert the formatted blank card into your system and boot it up. The boot process will create the basic directory structure
- shut down the handheld
- use your computer to put BIOS and ROM files on your card

This ensures that the card already has the correct folder structures and is recognized by your handheld properly.

## BIOS Files

The Adam image does not come with BIOS files. Where you have to put which of your own BIOS files is [documented in the image's wiki](https://github.com/eduardofilo/RG350_adam_image/wiki/En:-3.-Content-installation#bios). Most of the BIOS files have to be stored in the `BIOS` subfolder of the second SD card (TF2) and the libretro System.dat can be used to put them there

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS\ ^
      --output E:\BIOS
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/JELOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /Volumes/ADAM/BIOS
    ```

=== ":simple-linux: Linux"

    Replace the `/media/JELOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /media/ADAM/BIOS/
    ```

## ROMs

Adam supports many different ROM formats in subfolders of `ROMS` on the second SD card (TF2). An exhaustive list can be found in [their wiki](https://github.com/eduardofilo/RG350_adam_image/tree/master/data/local/home/.simplemenu/section_groups), where you can also find information about which ROMS are supported in compressed form. Most supported systems and their ROMS can be automatically sorted by `igir` using the `{adam}` output token. See the [replaceable tokens page](../../output/tokens.md) for more information.

Please note that sorting the supported Arcade machine releases (MAME, CPS, FBA) in a single pass is not supported be `igir` at this time. Please see the [Arcade docs](../arcade.md) docs for help with this.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\ROMS\{adam}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/ADAM` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/ADAM/ROMS/{adam}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/ADAM` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/ADAM/ROMS/{adam}" \
      --dir-letter \
      --no-bios
    ```
