# Output Tokens

When specifying a ROM [writing command](../commands.md) you have to specify an `--output` directory. `igir` has a few replaceable "tokens" that can be referenced in the `--output` directory value. This can aid in sorting ROMs into a more complicated directory structure.

For example, if you want to group all ROMs based on their region, you would specify:

=== "Windows"

    ```batch
    igir.exe copy extract --dat *.dat --input ROMs/ --output "ROMs-Sorted/{datReleaseRegion}/"
    ```

=== "macOS"

    ```shell
    igir copy extract --dat *.dat --input ROMs/ --output "ROMs-Sorted/{datReleaseRegion}/"
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

When using [DATs](../dats.md), you can make use of console & game information contained in them:

- `{datName}` the matching DAT's name, similar to how the `--dir-dat-name` option works
- `{datDescription}` the matching DAT's description, similar to how the `--dir-dat-description` option works
- `{datReleaseLanguage}` each of the ROM's language(s) (e.g. `EN`, `ES`, `JA`)
- `{datReleaseRegion}` each of the ROM's region(s) (e.g. `USA`, `EUR`, `JPN`, `WORLD`)

## File information

You can use some information about the input and output file's name & location:

- `{inputDirname}` the input file's dirname (full path minus file basename)
- `{outputBasename}` the output file's basename, equivalent to `{outputName}.{outputExt}`
- `{outputName}` the output file's filename without its extension
- `{outputExt}` the output file's extension

## Specific hardware

To help sort ROMs into unique file structures for popular frontends & hardware, `igir` offers a few specific tokens:

- `{pocket}` the [Analogue Pocket](../usage/hardware/analogue-pocket.md) core's directory for the ROM
- `{mister}` the [MiSTer FPGA](../usage/hardware/mister.md) core's directory for the ROM
- `{onion}` the [OnionOS / GarlicOS](../usage/handheld/onionos.md) emulator's directory for the ROM

!!! tip

    See the `igir --help` message for the list of all replaceable tokens.
