# Output Path Tokens

When specifying a ROM [writing command](../commands.md) you have to specify an `--output <path>` directory. Igir has a few replaceable "tokens" that can be referenced in the `--output <path>` directory value. This can aid in sorting ROMs into a more complicated directory structure.

See [output path tokens](./path-options.md) for other options that will further sort your ROMs into subdirectories.

For example, if you want to group all ROMs based on their region, you would specify:

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

!!! note

    Tokens can resolve to multiple values for each ROM. For example, a ROM may have multiple regions or languages. This will result in the same ROM being written to multiple locations.

## DAT information

When using [DATs](../dats/introduction.md), you can make use of console & game information contained in them:

- `{datName}` the matching DAT's name, similar to how the [`--dir-dat-name` option](./path-options.md) works
- `{datDescription}` the matching DAT's description, similar to how the [`--dir-dat-description` option](./path-options.md) works
- `{region}` each of the game's region(s) (e.g. `USA`, `EUR`, `JPN`, `WORLD`)
- `{language}` each of the game's language(s) (e.g. `EN`, `ES`, `JA`)
- `{type}` the game's "type," one of: `Aftermarket`, `Alpha`, `Bad`, `Beta`, `BIOS`, `Demo`, `Device`, `Fixed`, `Hacked`, `Homebrew`, `Overdump`, `Pending Dump`, `Pirated`, `Prototype`, `Retail` (most games will be this), `Sample`, `Test`, `Trained`, `Translated`, `Unlicensed`
- `{category}` the game's "category" (only some DATs provide this)
- `{genre}` the game's "genre" (most DATs don't provide this)

## File information

You can use some information about the input and output file's name & location:

- `{inputDirname}` the input file's dirname (full path minus file basename)
- `{outputBasename}` the output file's basename, equivalent to `{outputName}.{outputExt}`
- `{outputName}` the output file's filename without its extension
- `{outputExt}` the output file's extension

## Specific hardware

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
- `{twmenu}` the [TWiLightMenu++](../usage/handheld/twmenu.md) emulator's directory for the ROM

!!! tip

    See the `igir --help` message for the list of all replaceable tokens.
