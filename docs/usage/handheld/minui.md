# MinUI

[MinUI](https://github.com/shauninman/MinUI/) is a custom launcher supporting the Powkiddy RGB30, Trimui Smart (and Pro), Miyoo Mini (and Plus), as well as Anbernic RG35XX. It is focused on providing a minimalistic and easy to use frontend for the most important 8 and 16 bit consoles.

## BIOS Files

MinUI is strictly *bring your own BIOS*. You can find information on the required BIOS files [in the docs](https://github.com/shauninman/MinUI/blob/main/skeleton/EXTRAS/README.txt).

!!! info

    The following information is not guaranteed to be up to date and is based off the information from the link above at the time of writing as well as community contributions. Please reference the information provided by the developers of MinUI when running into troubles.

Place these files under `/Bios/<PAK-name>/<Filename>`:

| Console                   | PAK  | File           | MD5                                |
|---------------------------|------|----------------|------------------------------------|
| NEC TurboGrafx-16         | PCE  | `syscard3.pce` | `38179df8f4ac870017db21ebcbf53114` |
| Nintendo Game Boy         | GB   | `gb_bios.bin`  | `32fbbd84168d3482956eb3c5051637f5` |
| Nintendo Game Boy Color   | GBC  | `gbc_bios.bin` | `dbfce9db9deaa2567f6a84fde55f9680` |
| Nintendo Game Boy Advance | GBA  | `gba_bios.bin` | `a860e8c0b6d573d191e4ec7db1b1e4f6` |
| Nintendo Game Boy Advance | MGBA | `gba_bios.bin` | `a860e8c0b6d573d191e4ec7db1b1e4f6` |
| Nintendo Pokemon Mini     | PKM  | `bios.min`     | `1e4fb124a3a886865acb574f388c803d` |
| Nintendo Super Game Boy   | SGB  | `sgb.bios`     | `d574d4f9c12f305074798f54c091a8b4` |
| Sony PlayStation          | PS   | `scph1001.bin` | `924e392ed05558ffdb115408c263dccf` |

## ROMs

MinUI supports many systems and ROM formats. Check the folders [here (base)](https://github.com/shauninman/MinUI/tree/main/skeleton/BASE/Roms) and [here (extras)](https://github.com/shauninman/MinUI/tree/main/skeleton/EXTRAS/Roms) for a comprehensive list about the indivudual systems. Most supported systems and their ROMS can be automatically sorted by Igir using the `{minui}` output token. See the [replaceable tokens page](../../output/tokens.md) for more information.

MinUI uses the names unter /Roms on the SD card in a more creative way than most other frontends. The folder names consist of a *UI name* and a *PAK name*. The *UI name* is used as the name shown in the User interface as a list item name, while the *PAK name* controls which software pack is used to open the files within. Files with the same *UI name* but different *PAK name* are listed in the same list in the UI but are opened with different PAKs. Igir uses the vendor recommendations for the folder names with some exceptions.

MinUI requires multi-file releases to be grouped into subdirectories (bin/cue releases of the PS1 for example). It is recommended to use the [`--dir-game-subdir multiple` option](../../output/path-options.md), which is the default at this time.

More details about these features can be found [in GitHub](https://github.com/shauninman/MinUI/tree/main/skeleton/BASE) under the sections `Roms` and `Disc-based games`.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "E:\roms\{minui}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/MinUI` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/Volumes/MinUI/roms/{minui}" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/MinUI` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "/media/MinUI/roms/{minui}" \
      --dir-letter \
      --no-bios
    ```
