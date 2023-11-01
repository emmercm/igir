# TWiLightMenu++

!!! info

    [TWiLightMenu++](https://github.com/DS-Homebrew/TWiLightMenu) is a Retro Emulation OS for the Nintendo 3DS and DSi handhelds. It is not very well documented which consoles are supported. While the contributors list in [README.md](https://github.com/DS-Homebrew/TWiLightMenu/blob/master/README.md) suggests that a lot more systems are supported (Atari A800 for example) than we are filtering with the `{twmenu}` tag. This list may evolve while more users use and test the tag.

[TWiLightMenu++](https://github.com/DS-Homebrew/TWiLightMenu) is a launcher replacement software for the Nintendo 3DS and DSi handhelds. It aims to make launching and opening a multitude of media content types (Roms, music, videos etc.) easier and more convenient. It comes with many emulators preinstalled (see the link above). While large rom collections are hard to browse, it provides a neat way to carry more of your ROM collection on a great handheld.

## BIOS

TWiLightMenu++ ships with most emulators not needing BIOS files. No exceptions are known to the author.

## ROMs

TWiLightMenu uses its own proprietary [ROM folder structure](https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms) based in the root of the SD card, so `igir` has a replaceable `{twmenu}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\{twmenu}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/FunKeyS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/DSCard/roms/{twmenu}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/FunKeyS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/DSCard/roms/{twmenu}" \
      --dir-letter \
      --no-bios
    ```
