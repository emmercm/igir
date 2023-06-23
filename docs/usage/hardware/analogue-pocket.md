# Analogue Pocket

The [Analogue Pocket](https://www.analogue.co/pocket) is a field-programmable gate array (FPGA) handheld that plays Game Boy, Game Boy Color, and Game Boy Advance cartridges by simulating the hardware. It can also be extended to simulate other [generation 1-4 consoles](https://en.wikipedia.org/wiki/Home_video_game_console_generations) & handheld hardware with Analogue's [openFPGA](https://www.analogue.co/developer).

These other hardware simulations are called "cores," and they each expect their ROMs in a very specific directory on the Analogue Pocket's SD card.

!!! tip

    You can install openFPGA cores easily with utilities such as Matt Pannella's [`pocket_updater`](https://github.com/mattpannella/pocket-updater-utility).

## BIOS

Most Pocket updater utilities will download BIOS files required for each core for you automatically, so you shouldn't need to source & sort them yourself.

## ROMs

`igir` has support for replaceable "tokens" in the `--output` option. This makes it easier to sort ROMs on devices that have an expected directory structure. The `{pocket}` token exists to help sort ROMs on the Analogue pocket. See the [replaceable tokens page](../../output/tokens.md) for more information.

This token can be used to reference each core's specific directory in the SD card's `Assets` directory. ROMs go in the `Assets/{pocket}/common` directory.

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs" ^
      --output "E:\Assets\{pocket}\common" ^
      --dir-letter ^
      --clean-exclude "E:\Assets\*\common\*.*" ^
      --no-bios
    ```

=== "macOS"

    Replace the `/Volumes/POCKET` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "/Volumes/POCKET/Assets/{pocket}/common/" \
      --dir-letter \
      --clean-exclude "/Volumes/POCKET/Assets/*/common/*.*" \
      --no-bios
    ```

!!! note

    The `--clean-exclude` option in the above examples is so we don't accidentally "clean" (delete) the BIOS files for each core.

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
│   ├── snes
│   │   └── common
│   │       ├── ROM1.snes
│   │       ├── ROM2.snes
│   │       └── ROM3.snes
├── Cores
├── Platforms
└── Presets
```
