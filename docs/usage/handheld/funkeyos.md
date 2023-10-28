# FunKey OS

!!! info

    [FunKey OS](https://github.com/FunKey-Project/FunKey-OS) is a Retro Emulation OS for the [FunKey S](https://www.funkey-project.com/) handheld. It is also used on the [Anbernic RG Nano](https://anbernic.com/products/rg-nano). It is not very well documented which consoles are supported on which device. The `funkeyos` tag should handle systems supported by either of those handhelds.

[FunKey OS](https://github.com/FunKey-Project/FunKey-OS) is a minimalistic buildroot based Linux distribution originally designed for the tiny ARM based [FunKey S](https://www.funkey-project.com/) handheld. It is also used on the [Anbernic RG Nano](https://anbernic.com/products/rg-nano) with a few modifications.

## BIOS

FunKey OS ships with most emulators not needing BIOS files. Two notable exceptions are the GBA BIOS as well as the PS1 BIOS. These can be [installed manually](https://doc.funkey-project.com/user_manual/tutorials/software/gba_bios/). Only two files are needed, so automating the task might be more work than copying them across.

To sum up the documentation, two files need to be copied:

* `gba_bios.bin` (MD5 hash `a860e8c0b6d573d191e4ec7db1b1e4f6`) to `<sdcard>/Game Boy Advance` for the GBA BIOS
* `SCPH1001.BIN` (512kib in size) to `<sdcard>/PS1` of the card for the PS1 BIOS

## ROMs

Funkey OS uses its own proprietary [ROM folder structure](https://github.com/FunKey-Project/FunKey-OS/tree/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections) based in the root of the SD card, so `igir` has a replaceable `{funkeyos}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\{funkeyos}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/FunKeyS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/FunKeyS/{funkeyos}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/FunKeyS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/FunKeyS/{funkeyos}" \
      --dir-letter \
      --no-bios
    ```
