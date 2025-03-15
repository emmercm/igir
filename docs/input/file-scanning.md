# File Scanning

Igir has a few options to specify input files, as well as files to exclude:

- ROMs: `--input <path>`, `--input-exclude <path>`
- [DATs](../dats/processing.md): `--dat <path>`, `--dat-exclude <path>`
- [ROM patches](../roms/patching.md): `--patch <path>`, `--patch-exclude <path>`

## Archive files

Igir can scan archives for DATs, ROMs, and patches. See the [archives](reading-archives.md) page for more information on supported formats.

## Glob patterns

All input options support [glob patterns](https://en.wikipedia.org/wiki/Glob_(programming)). These patterns help you specify file paths using simple wildcards (e.g. `ROMs/*.rom`) as well as more complex patterns (e.g. `ROMs/!(GBA)/**/*.rom`).

!!! tip

    [globster.xyz](https://globster.xyz/?q=**%2F*&f=gb%2FBomberman%20GB%20(USA%2C%20Europe)%20(SGB%20Enhanced).gb%2Cgb%2F%5BBIOS%5D%20Nintendo%20Game%20Boy%20Boot%20ROM%20(World)%20(Rev%201).gb%2Cgba%2Fmisc%2FDragon%20Ball%20Z%20-%20The%20Legacy%20of%20Goku%20II%20International%20(Japan).gba%2Cgba%2Fmisc%2F%5BBIOS%5D%20Game%20Boy%20Advance%20(World).gba%2Cgbc%2FLegend%20of%20Zelda%2C%20The%20-%20Link%27s%20Awakening%20DX%20(USA%2C%20Europe)%20(Rev%202)%20(SGB%20Enhanced)%20(GB%20Compatible).gbc%2Cgbc%2F%5BBIOS%5D%20Nintendo%20Game%20Boy%20Color%20Boot%20ROM%20(World)%20(Rev%201).gbc) is a great website to test various glob patterns.

### Examples

Given this file tree, here are some glob pattern examples:

```text
.
├── gb
│   ├── Bomberman GB (USA, Europe) (SGB Enhanced).gb
│   └── [BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1).gb
├── gba
│   └── misc
│       ├── Dragon Ball Z - The Legacy of Goku II International (Japan).gba
│       └── [BIOS] Game Boy Advance (World).gba
└── gbc
    ├── Legend of Zelda, The - Link's Awakening DX (USA, Europe) (Rev 2) (SGB Enhanced) (GB Compatible).gbc
    └── [BIOS] Nintendo Game Boy Color Boot ROM (World) (Rev 1).gbc
```

Only process USA ROMs:

```text
--input "**/*USA*"
```

Only process BIOS ROMs:

```text
--input "**/\[BIOS\]*"
```

Only process ROMs one level deep:

```text
--input "*/*"
```

Process non-GBC ROMs:

```text
--input "!(gbc)/**"
```

Try some of these patterns for yourself on [globster.xyz](https://globster.xyz/?q=**%2F*&f=gb%2FBomberman%20GB%20(USA%2C%20Europe)%20(SGB%20Enhanced).gb%2Cgb%2F%5BBIOS%5D%20Nintendo%20Game%20Boy%20Boot%20ROM%20(World)%20(Rev%201).gb%2Cgba%2Fmisc%2FDragon%20Ball%20Z%20-%20The%20Legacy%20of%20Goku%20II%20International%20(Japan).gba%2Cgba%2Fmisc%2F%5BBIOS%5D%20Game%20Boy%20Advance%20(World).gba%2Cgbc%2FLegend%20of%20Zelda%2C%20The%20-%20Link%27s%20Awakening%20DX%20(USA%2C%20Europe)%20(Rev%202)%20(SGB%20Enhanced)%20(GB%20Compatible).gbc%2Cgbc%2F%5BBIOS%5D%20Nintendo%20Game%20Boy%20Color%20Boot%20ROM%20(World)%20(Rev%201).gbc)!
