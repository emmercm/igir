# SpruceOS

[SpruceOS](https://github.com/spruceUI/spruceOS) is a frontend overhaul for several devices with the focus of optimisation and debloating of the stock firmware they shipped with.

It's folder structure is very similar to [OnionOS](../usage/handheld/onionos.md), however SpruceOS supports additional consoles being emulated, most notably more optical media based consoles which may not work well on all devices.

## BIOS

SpruceOS has its BIOS folder at the root of the SD card at `/BIOS/` per RetroArch requirements. More information can be found on their wiki page on [adding BIOS]([10. Adding BIOS · spruceUI/spruceOS Wiki · GitHub](https://github.com/spruceUI/spruceOS/wiki/10.-Adding-BIOS):

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:
    
    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS\ ^
      --output E:\BIOS
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/SpruceOS` drive name with whatever your SD card is named:
    
    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /Volumes/SpruceOS/BIOS
    ```

=== ":simple-linux: Linux"

    Replace the `/media/SpruceOS` path with wherever your SD card is mounted:
    
    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /media/SpruceOS/BIOS
    ```

## ROMs

SpruceOS uses its own folder structure similar to [OnionOS](../usage/handheld/onionos.md)

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:
    
    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\Roms\{spruce}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/SpruceOS` drive name with whatever your SD card is named:
    
    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/SpruceOS/Roms/{spruce}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/SpruceOS` path with wherever your SD card is mounted:
    
    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/SpruceOS/Roms/{spruce}" \
      --dir-letter \
      --no-bios
    ```
