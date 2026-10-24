# ROM Patching

Patches contain a set of changes that can be applied to a file, turning that file into something different. Common examples for patching ROMs are: translating text to a different language but keeping game logic the same, and fan-made creations such as new levels for an existing game.

Games and their ROMs are protected under copyrights, so patches are used to not share copyrighted code online. A person needs the original ROM file plus a patch file to get the resulting patched ROM that will be played with an emulator.

## Specifying patch files

Patch files can be specified with the `--patch <path|glob>` option. See the [file scanning docs](../input/file-scanning.md) for more information.

## Supported command combinations

Patching can be used with any combination of the [`copy` or `move` commands](../commands.md#rom-writing), with or without the [`extract` or `zip` commands](../commands.md#rom-extracting-zipping). Patching can't be used with the [`link` command](../commands.md#link).

Patches need to read the ROM's contents, so there are some limitations when ROMs are archived and those archives would be copied or moved as-is:

| Commands                         | Patched un-archived ROMs | Patched archived ROMs                                                                                        |
|----------------------------------|--------------------------|--------------------------------------------------------------------------------------------------------------|
| `copy` or `move`                 | ✅                       | ❌ input archives will not be modified in any way                                                            |
| `copy extract` or `move extract` | ✅                       | ✅                                                                                                           |
| `copy zip` or `move zip`         | ✅                       | ⚠️ only ROMs that aren't [excluded from zipping](../output/writing-archives.md#excluding-files-from-zipping) |

## Supported patch types

There are many, _many_ patch types that ROM hackers use to distribute their changes on the internet ([xkcd "Standards"](https://xkcd.com/927/)). Typically, a patch will only be distributed in one format, so gamers are entirely at the mercy of the ROM hacker's choice.

Not all patch types are created equal. Here are some tables of some existing formats, whether Igir supports them, and what the patch supports.

**Common patch types:**

| Type                                   | Supported                            | CRC32 in patch contents | Notes                                                      |
|----------------------------------------|--------------------------------------|-------------------------|------------------------------------------------------------|
| `.bps` (Beat Patch - Single File)      | ✅                                   | ✅                      | byuu's ~2011 successor for both `.ips` and `.ups` patches. |
| `.ips` (International Patching System) | ✅ IPS, IPS32                        | ❌                      |                                                            |
| `.ppf` (PlayStation Patch File)        | ✅ v2, v3                            | ❌                      |                                                            |
| `.ups` (Universal Patching System)     | ✅                                   | ✅                      | byuu's ~2008 successor for `.ips` patches.                 |
| `.vcdiff`, `.xdelta`                   | ⚠️ (LZMA secondary compression only) | ❌                      |                                                            |

**Uncommon patch types:**

| Type                             | Supported                                              | CRC32 in patch contents | Notes                                                                                                                   |
|----------------------------------|--------------------------------------------------------|-------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `.aps` (GBA)                     | ✅                                                     | ❌                      |                                                                                                                         |
| `.aps` (N64)                     | ✅ simple & N64                                        | ❌                      |                                                                                                                         |
| `.bdf`, `.bsdiff` (BSDiff)       | ✅ v4                                                  | ❌                      |                                                                                                                         |
| `.bpm` (Beat Patch - Multi File) | ❌                                                     | ❓                      | The multi-file version of `.bps`. Multi-file patches will likely never be supported.                                    |
| `.bsp` (Binary Script Patching)  | ❌                                                     | ❌                      | BSP will probably never be supported, the implementation is [non-trivial](https://github.com/aaaaaa123456789/bsp).      |
| `.dldi` (NDS libfat)             | ❌                                                     | ❌                      | No file specification exists.                                                                                           |
| `.dps` (Deufeufeu)               | ✅                                                     | ❌                      |                                                                                                                         |
| `.ebp` (EarthBound)              | ✅                                                     | ❌                      | EBP is just IPS with some JSON after the `EOF` string.                                                                  |
| `.gdiff`                         | ❌                                                     | ❓                      |                                                                                                                         |
| `.mod` (Paper Mario Star Rod)    | ✅ PMSR, Yay0-compressed PMSR                          | ❌                      | The input file has to be `Paper Mario (USA).z64` (CRC32 `A7F5CD7E`), so you don't need to put it in the patch filename. |
| `.ffp`, `.pat` (FireFlower)      | ❌                                                     | ❓                      | No file specification exists anymore.                                                                                   |
| `.pds` (Sephiroth87's NDS)       | ❌                                                     | ❓                      | No file specification exists.                                                                                           |
| `.rup` (NINJA 2.0)               | ⚠️ only single file patches, only raw/binary file type | ❌ uses MD5             | Multi-file patches will likely never be supported.                                                                      |
| `.rxl` (ROM eXtension Library)   | ❌                                                     | ❌                      | RXL will probably never be supported, it is used to inject files at manually specified locations into ROMs.             |

If you have a choice in patch format, choose one that contains CRC32 checksums in the patch file contents (e.g. choose `.bps` over `.ips` if possible).

!!! note

    Igir can read patch files inside any supported [archive format](../input/reading-archives.md) (just like DATs and ROMs), but most patch types will have to be fully extracted to a [temporary file](https://igir.io/advanced/temp-dir/) before they can be applied.

## ROM checksum matching

Igir needs to be able to know what input ROM each patch file applies to, and it does this using CRC32 checksums.

A few patch formats include the input ROM's CRC32 checksum in the patch's file contents. This is the most accurate and therefore the best way to get input ROM information. `.bps` is a great example of an efficient and simple patch format that includes this information.

Most patch formats _do not_ include the input ROM's CRC32 checksum. `.ips` patches are some of the most likely you will come across. For those patches, you need to put the input ROM's CRC32 checksum in the patch's filename. Here are some examples:

| Input ROM filename                                 | Patch filename with CRC32 information                                                               |
|----------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `Super Mario Land (World).gb`                      | At the end: `Super Mario Land DX v2.0 (World) 90776841.ips`                                         |
| `NBA Jam - Tournament Edition (USA) (Track 1).bin` | At the beginning: `A8F1ADF5 NBA Jam 22 v1.4.ppf`                                                    |
| `Mega Man - Dr. Wily's Revenge (USA).gb`           | In square brackets: `Mega Man - Dr. Wily's Revenge DX v1.02 (USA) [47e70e08].ips`                   |
| `Metroid II - Return of Samus (World).gb`          | In parentheses: `Metroid II - Return of Samus DX v2.0 (World) (DEE05370).ips`                       |
| `Pokemon Card GB 2 - GR Dan Sanjou! (Japan).gbc`   | With an 0x prefix: `Pokemon Card GB 2 - GR Dan Sanjou! (Japan) 0x6c933a14 [T+En1.0_Artemis251].gbc` |

!!! note

    Providing `--patch <path|glob>` will cause Igir to calculate CRC32 checksums for input files regardless of what [`--input-checksum-min <algorithm>`](matching.md#automatically-using-other-checksum-algorithms) is provided. Igir will still prefer to match ROMs to DATs with the highest checksum possible.

## Patch file naming

Igir will generate the patched file's output filename from the patch's filename. The input ROM's filename is completely ignored (other than for [checksum matching](#rom-checksum-matching)). Examples:

| Input ROM filename                                                  | Patch filename                                                      | Output filename written                                    |
|---------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------------|
| `Kirby's Dream Land 2 (USA, Europe) (SGB Enhanced).gb` (`8DC07C35`) | `Kirby's Dream Land 2 DX v1.2.bps`                                  | `Kirby's Dream Land 2 DX v1.2.gb`                          |
| `Super Mario Land 2 - 6 Golden Coins (USA, Europe).gb`              | `Super Mario Land 2 - 6 Golden Coins v1.8.1 D5EC24E4.ips`           | `Super Mario Land 2 - 6 Golden Coins v1.8.1.gb`            |
| `Legend of Zelda, The - A Link to the Past (USA).sfc`               | `Legend of Zelda, The - A Link to the Past MSU-1 v1.2 777AAC2F.ips` | `Legend of Zelda, The - A Link to the Past MSU-1 v1.2.sfc` |
| `Super Smash Bros. (USA).z64`                                       | `Smash Remix v2.0.1 EB97929E.xdelta`                                | `Smash Remix v2.0.1.z64`                                   |

!!! note

    Patch files should have a different name from their input ROM file. If they are the same, then Igir will report an error that two different files cannot write to the same output location.

## Only writing patched ROMs

By default, Igir will write patched ROMs in _addition_ to un-patched ROMs. This includes any ROMs that do not have any matching patches in a `--patch <path|glob>`.

If you want to _only_ write patched ROMs to the output directory, you can use the option:

```text
--patch-only
```

## Creating ROM patches

Marc Robledo's [Rom Patcher JS](https://www.marcrobledo.com/RomPatcher.js/) site is a great resource for creating ROM patches in a number of common formats without the need to download any tools.
