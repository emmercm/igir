# Analogue Pocket

The [Analogue Pocket](https://www.analogue.co/pocket) is a field-programmable gate array (FPGA) handheld that plays Game Boy, Game Boy Color, and Game Boy Advance cartridges by simulating the hardware. It can also be extended to simulate other [generation 1-4 consoles](https://en.wikipedia.org/wiki/Home_video_game_console_generations) & handheld hardware with Analogue's [openFPGA](https://www.analogue.co/developer).

These other hardware simulations are called "cores," and they each expect their ROMs in a very specific directory on the Analogue Pocket's SD card.

!!! tip

    You can install openFPGA cores easily with utilities such as Matt Pannella's [`pocket_updater`](https://github.com/mattpannella/pocket-updater-utility).

## BIOS

Most Pocket updater utilities will download BIOS files required for each core for you automatically, so you shouldn't need to source & sort them yourself.

## ROMs

`igir` has support for replaceable "tokens" in the `--output <path>` option. This makes it easier to sort ROMs on devices that have an expected directory structure. The `{pocket}` token exists to help sort ROMs on the Analogue pocket. See the [replaceable tokens page](../../output/tokens.md) for more information.

This token can be used to reference each core's specific directory in the SD card's `Assets` directory. ROMs go in the `Assets/{pocket}/common` directory.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --dat-name-regex-exclude "/headerless/i" ^
      --input "ROMs" ^
      --output "E:\Assets\{pocket}\common" ^
      --dir-letter ^
      --dir-letter-limit 1000 ^
      --clean-exclude "E:\Assets\*\common\*.*" ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/POCKET` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --dat-name-regex-exclude "/headerless/i" \
      --input "ROMs/" \
      --output "/Volumes/POCKET/Assets/{pocket}/common/" \
      --dir-letter \
      --dir-letter-limit 1000 \
      --clean-exclude "/Volumes/POCKET/Assets/*/common/*.*" \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/POCKET` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --dat-name-regex-exclude "/headerless/i" \
      --input "ROMs/" \
      --output "/media/POCKET/Assets/{pocket}/common/" \
      --dir-letter \
      --dir-letter-limit 1000 \
      --clean-exclude "/media/POCKET/Assets/*/common/*.*" \
      --no-bios
    ```

!!! note

    The [`--dat-name-regex-exclude "/headerless/i"` option](../../dats/processing.md#dat-name-regex-filtering) in the above examples is to exclude any "headered" No-Intro DATs. Some consoles such as NES have separate "headered" and "headerless" DATs, and they have duplicated ROM filenames, so we want to avoid writing different input files to the same output location.

!!! note

    The [`--dir-letter-limit 1000`](../../output/path-options.md#limit-the-number-of-games-in-a-subdirectory) option in the above example is because some cores won't read more than a certain number of files in one directory. See [output path options](../../output/path-options.md) for other options available.

!!! note

    The [`--clean-exclude <path>`](../../output/cleaning.md#exclusions) option in the above examples is so we don't accidentally "clean" (delete) the BIOS files for each core.

Your SD card should look like this, likely with more cores:

```text
├── Assets
│   ├── genesis
│   │   └── common
│   │       ├── ROM1.md
│   │       ├── ROM2.md
│   │       └── ROM3.md
│   ├── nes
│   │   └── common
│   │       ├── ROM1.nes
│   │       ├── ROM2.nes
│   │       └── ROM3.nes
│   ├── sms
│   │   └── common
│   │       ├── ROM1.sms
│   │       ├── ROM2.sms
│   │       └── ROM3.sms
│   └── snes
│       └── common
│           ├── ROM1.snes
│           ├── ROM2.snes
│           └── ROM3.snes
├── Cores
├── Platforms
└── Presets
```
