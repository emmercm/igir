# OnionOS / GarlicOS

!!! info

    [OnionOS](https://github.com/OnionUI/Onion) is based on [RetroArch](https://www.retroarch.com/), and [GarlicOS](https://www.patreon.com/posts/76561333) is based on OnionOS, so most instructions are very similar.

[OnionOS](https://github.com/OnionUI/Onion) is a popular "OS overhaul" for the Miyoo Mini, and [GarlicOS](https://www.patreon.com/posts/76561333) is a similar overhaul for the Anbernic RG35XX.

## BIOS

OnionOS has its BIOS folder at the root of the SD card at `/BIOS/`, and it uses the [RetroArch filenames](https://onionui.github.io/docs/installation/fresh#step-3-copy-over-your-bios-and-rom-files):

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS\ ^
      --output E:\BIOS
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/OnionOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /Volumes/OnionOS/BIOS
    ```

=== ":simple-linux: Linux"

    Replace the `/media/OnionOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /media/OnionOS/BIOS
    ```

## ROMs

OnionOS uses its own proprietary [ROM folder structure](https://github.com/OnionUI/Onion/wiki/Emulators#rom-folders---quick-reference), so Igir has a replaceable `{onion}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\Roms\{onion}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/OnionOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/OnionOS/Roms/{onion}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/OnionOS` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/OnionOS/Roms/{onion}" \
      --dir-letter \
      --no-bios
    ```
