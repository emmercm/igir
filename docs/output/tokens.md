# Output Path Tokens

When specifying a ROM [writing command](../commands.md) you have to specify an `--output <path>` directory. Igir has a few replaceable "tokens" that can be referenced in the `--output <path>` directory value. This can aid in sorting ROMs into a more complicated directory structure.

See [output path options](./path-options.md) for other options that will further sort your ROMs into subdirectories.

As an example, if you want to group all ROMs based on their region, you would specify:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy extract ^
      --dat *.dat ^
      --input ROMs\ ^
      --output "ROMs-Sorted\{region}\"
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy extract \
      --dat *.dat \
      --input ROMs/ \
      --output "ROMs-Sorted/{region}/"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy extract \
      --dat *.dat \
      --input ROMs/ \
      --output "ROMs-Sorted/{region}/"
    ```

This might result in an output structure such as:

```text
ROMs-Sorted/
├── AUS
│   └── Pokemon Pinball (USA, Australia) (Rumble Version) (SGB Enhanced) (GB Compatible).gbc
├── EUR
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
│   ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
└── USA
    ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
    ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
    ├── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
    └── Pokemon Pinball (USA, Australia) (Rumble Version) (SGB Enhanced) (GB Compatible).gbc
```

!!! tip

    See the `igir --help` message for the list of all replaceable tokens.

## DAT information

When using [DATs](../dats/introduction.md), you can make use of console & game information contained in them:

- `{datName}` the matching DAT's name, similar to how the [`--dir-dat-name` option](./path-options.md) works
- `{datDescription}` the matching DAT's description, similar to how the [`--dir-dat-description` option](./path-options.md) works
- `{region}` each of the game's region(s) (e.g. `USA`, `EUR`, `JPN`, `WORLD`)
- `{language}` each of the game's language(s) (e.g. `EN`, `ES`, `JA`)
- `{type}` the game's "type," one of: `Aftermarket`, `Alpha`, `Bad`, `Beta`, `BIOS`, `Demo`, `Device`, `Fixed`, `Hacked`, `Homebrew`, `Overdump`, `Pending Dump`, `Pirated`, `Prototype`, `Retail` (most games will be this), `Sample`, `Test`, `Trained`, `Translated`, `Unlicensed`
- `{category}` the game's "category" (only some DATs provide this)
- `{genre}` the game's "genre" (most DATs don't provide this)

!!! note

    Some DAT tokens can resolve to multiple values for each ROM. For example, a ROM may have multiple regions or languages. This will result in the same ROM being written to multiple locations.

## File information

You can use some information about the input and output file's name & location:

- `{inputDirname}` the input file's dirname (full path minus file basename)
- `{outputBasename}` the output file's basename, equivalent to `{outputName}.{outputExt}`
- `{outputName}` the output file's filename without its extension
- `{outputExt}` the output file's extension

## Frontends & consoles

To help sort ROMs into unique file structures for popular frontends & hardware, Igir offers a few specific tokens:

- `{adam}` the ['Adam' image](../usage/handheld/adam.md) emulator's directory for the ROM
- `{batocera}` the [Batocera](../usage/desktop/batocera.md) emulator's directory for the ROM
- `{es}` the [EmulationStation](../usage/desktop/emulationstation.md) emulator's directory for the ROM
- `{funkeyos}` the [FunKey OS](../usage/handheld/funkeyos.md) emulator's directory for the ROM
- `{jelos}` the [JELOS](../usage/handheld/jelos.md) emulator's directory for the ROM
- `{minui}` the [MinUI](../usage/handheld/minui.md) emulator's directory for the ROM
- `{mister}` the [MiSTer FPGA](../usage/hardware/mister.md) core's directory for the ROM
- `{miyoocfw}` the [MiyooCFW](../usage/handheld/miyoocfw.md) emulator's directory for the ROM
- `{onion}` the [OnionOS / GarlicOS](../usage/handheld/onionos.md) emulator's directory for the ROM
- `{pocket}` the [Analogue Pocket](../usage/hardware/analogue-pocket.md) core's directory for the ROM
- `{retrodeck}` the [RetroDECK](../usage/desktop/retrodeck.md) emulator's directory for the ROM
- `{romm}` the [RomM](../usage/desktop/romm.md) manager directory for the ROM
- `{spruce}` the [SpruceOS](../usage/handheld/spruceos.md) emulator's directory for the ROM
- `{twmenu}` the [TWiLightMenu++](../usage/handheld/twmenu.md) emulator's directory for the ROM

These different frontends expect specific folder names for different consoles. Igir will determine the appropriate console for each ROM by matching the DAT name with regular expressions. If DATs aren't supplied, Igir will do its best to determine the appropriate console using the ROM's file extension.

As an example, when using No-Intro DATs, ROMs can be sorted into the [MiSTer FPGA](../usage/hardware/mister.md) folder structure like this:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy extract ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output "ROMs-Sorted\{mister}\"
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy extract \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "ROMs-Sorted/{mister}/"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy extract \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output "ROMs-Sorted/{mister}/"
    ```

```text
ROMs-Sorted/
├── Gameboy
│   ├── Hyper Lode Runner (World) (Rev 1).gb
│   ├── Wave Race (USA, Europe).gb
├── MegaDrive
│   ├── Shinobi III - Return of the Ninja Master (USA).md
│   ├── X-Men 2 - Clone Wars (USA, Europe).md
└── SNES
    ├── F-Zero (USA).sfc
    └── Mario Paint (Japan, USA) (En).sfc
```

!!! note

    It is difficult to keep up with new popular frontends as they are created, and it is difficult to keep up with frontends that change their file structure often. If you notice that a value is wrong, please submit a [pull request](https://github.com/emmercm/igir/pulls)!

### Custom console tokens

Because it is infeasible for Igir to handle every possible frontend, and because different users have different needs, it is possible to replace the built-in frontend & console tokens with your own. The option is:

```text
--output-console-tokens <path>
```

The option requires a file path to a JSON file in this format:

```json
{
  "consoles": [
    {
      "datNameRegex": "/GB|Game ?Boy/i",
      "extensions": [".gb", ".sgb"],
      "tokens": {
        "lorem": "Gameboy",
        "ipsum": "gb"
      }
    },
    {
      "datNameRegex": "/GBC|Game ?Boy Color/i",
      "extensions": [".gbc"],
      "tokens": {
        "lorem": "Gameboy",
        "ipsum": "gbc"
      }
    }
  ]
}
```

You can name the tokens anything you want. The above example supports replacing the tokens `{lorem}` and `{ipsum}`.
