# MiyooCFW

[MiyooCFW](https://github.com/TriForceX/MiyooCFW/wiki) ([Code](https://github.com/TriForceX/MiyooCFW)) is a custom firmware  for BittBoy, PocketGo, PowKiddy V90-Q90-Q20 and third party handheld consoles. It is based on the buildroot build environment and loosely based on OpenDingux. While it is intended for the named less powerful handhelds, it packs a good and wide selection of emulators. Some tinkering with the BIOS files is required though, but no worries, most of that is covered below or in their [Wiki](https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info)

## BIOS Files

MiyooCFW doesn't seem to have a centralized folder for putting BIOS files so it's a chore to prepare the card for running the provided emulators. Here's a try to help with finding the right ones and putting them in the right place.

!!! info

    Please keep in mind that this information is based on the table in the official [MiyooCFW Emulator Info](https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info) and might be out of date. Please refer to the official list for reference.

| System                         | Emulator     | Folder                   | Filenames                                                   | MD5SUMs                                                                                                              | Comments                                                                                                                       |
|--------------------------------|--------------|--------------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| GB/GBC                         | Gambatte     | /.gambatte/bios/BIOS     | `gb_bios.bin` &#10; `gbc_bios.bin`                          | `32fbbd84168d3482956eb3c5051637f5` &#10; `dbfce9db9deaa2567f6a84fde55f9680`                                          | Only required for authentic boot screen                                                                                        |
| GBA                            | GPSP         | /emus/gpsp_gameblabla/   | `gba_bios.bin`                                              | `a860e8c0b6d573d191e4ec7db1b1e4f6`                                                                                   |                                                                                                                                |
| GBA                            | GPSP Rumble  | /emus/gpsp/              | `gba_bios.bin`                                              | `a860e8c0b6d573d191e4ec7db1b1e4f6`                                                                                   |                                                                                                                                |
| NES                            | FCEUX        | /.fceux/                 | `disksys.rom`                                               | `ca30b50f880eb660a320674ed365ef7a`                                                                                   | For Famicom Disk System                                                                                                        |
| Sega Master System / Game Gear | SMS Plus GX  | /emus/smsplusgx/bios/    | `BIOS.col`                                                  | `840481177270d5642a14ca71ee72844c`                                                                                   | System.dat calls this `bios.sms`                                                                                               |
| Sega Megadrive / Genesis       | Picodrive    | /.picodrive/             | `bios_cd_e.bin` &#10; `bios_cd_j.bin` &#10; `bios_cd_u.bin` | `e66fa1dc5820d254611fdcdba0662372` &#10; `278a9397d192149e84e820ac621a8edd` &#10; `2efd74e3232ff260e371b99f84024f7f` | for Mega-CD only. System.dat uses different casing.                                                                            |
| PC Engine / Turbogfx-16        | Temper       | /.temper/syscards/       | `syscard3.pce`                                              | `38179df8f4ac870017db21ebcbf53114`                                                                                   | for CD based games                                                                                                             |
| SNK NeoGeo                     | GNGeo        | /roms/NEOGEO/            | `NEOGEO.zip`                                                | unknown                                                                                                              | version from FBA 0.2.97.39 works                                                                                               |
| Sony PlayStation 1             | PCSX ReARMed | /emus/pcsx_rearmed/bios/ | `SCPH1001.BIN`                                              | `924e392ed05558ffdb115408c263dccf`                                                                                   | Optional but required for LLE, activate in options                                                                             |
| GCE Vectrex                    | Vecxemu      | /.vecxemu/               | `rom.dat`                                                   | `ab082fa8c8e632dd68589a8c7741388f`                                                                                   | not part of 'System.dat', available as part of the [vecxemu rom.dat](https://github.com/gameblabla/vecxemu/raw/master/rom.dat) |

## ROMs

MiyooCFW supports many many systems and ROM formats. Check the table on the [MiyooCFW Wiki](https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info) for more precise instructions about the indivudual systems. Most supported systems and their ROMS can be automatically sorted by Igir using the `{miyoocfw}` output token. See the [replaceable tokens page](../../output/tokens.md) for more information.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\roms\{miyoocfw}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/MiyooCFW` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/MiyooCFW/roms/{miyoocfw}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/MiyooCFW` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/MiyooCFW/roms/{miyoocfw}" \
      --dir-letter \
      --no-bios
    ```
