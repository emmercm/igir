# ROM Patching

Patches contain a set of changes that can be applied to a file, turning that file into something different. Common examples for patching ROMs are: translating text to a different language but keeping game logic the same, and fan-made creations such as new levels for an existing game.

Games and their ROMs are protected under copyrights, so patches are used to not share copyrighted code online. A person needs the original ROM file plus a patch file to get the resulting patched ROM that will be played with an emulator.

## Specifying patch files

Patch files can be specified with the `--patch <path>` option. See the [file scanning docs](../input/file-scanning.md) for more information.

## Patch types

There are many, _many_ patch types that ROM hackers use to distribute their changes on the internet ([xkcd "Standards"](https://xkcd.com/927/)). Typically, a patch will only be distributed in one format, so gamers are entirely at the mercy of the ROM hacker's choice.

Not all patch types are created equal. Here are some tables of some existing formats, whether Igir supports them, and what the patch supports.

**Common patch types:**

| Type                 | Supported                        | CRC32 in patch contents | Notes                                                                                                                                                                                                 |
|----------------------|----------------------------------|-------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.bps`               | ✅                                | ✅                       |                                                                                                                                                                                                       |
| `.ips`               | ✅ IPS, IPS32                     | ❌                       |                                                                                                                                                                                                       |
| `.ppf`               | ✅ 2.0, 3.0                       | ❌                       |                                                                                                                                                                                                       |
| `.ups`               | ✅                                | ✅                       | ⚠️ UPS patches read and write files byte-by-byte, making them horribly slow and inefficient. The author, byuu, created `.ups` to replace `.ips`, but then created `.bps` as a replacement for `.ups`. |
| `.vcdiff`, `.xdelta` | ⚠️ without secondary compression | ❌                       | ⚠️ [xdelta3](https://github.com/jmacd/xdelta) makes use of LZMA secondary compression by default, so many patches are likely to be unsupported.                                                       |

**Uncommon patch types:**

| Type                            | Supported                                              | CRC32 in patch contents | Notes                                                                                                              |
|---------------------------------|--------------------------------------------------------|-------------------------|--------------------------------------------------------------------------------------------------------------------|
| `.aps` (GBA)                    | ✅                                                      | ❌                       |                                                                                                                    |
| `.aps` (N64)                    | ✅ simple & N64                                         | ❌                       |                                                                                                                    |
| `.bdf` (BSDiff)                 | ❌                                                      | ❓                       |                                                                                                                    |
| `.bsp` (Binary Script Patching) | ❌                                                      | ❌                       | BSP will probably never be supported, the implementation is [non-trivial](https://github.com/aaaaaa123456789/bsp). |
| `.dldi` (NDS libfat)            | ❌                                                      | ❌                       | No file specification exists.                                                                                      |
| `.dps` (Deufeufeu)              | ✅                                                      | ❌                       |                                                                                                                    |
| `.ebp` (EarthBound)             | ✅                                                      | ❌                       | EBP is just IPS with some JSON after the `EOF` string.                                                             |
| `.gdiff`                        | ❌                                                      | ❓                       |                                                                                                                    |
| `.mod` (Star Rod)               | ❌                                                      | ❓                       | No file specification exists anymore.                                                                              |
| `.ffp`, `.pat` (FireFlower)     | ❌                                                      | ❓                       | No file specification exists anymore.                                                                              |
| `.pds` (Sephiroth87's NDS)      | ❌                                                      | ❓                       | No file specification exists.                                                                                      |
| `.rup` (NINJA 2.0)              | ⚠️ only single file patches, only raw/binary file type | ❌ uses MD5              |                                                                                                                    |
| `.rxl` (ROM eXtension Library)  | ❌                                                      | ❌                       | RXL will probably never be supported, it is used to inject files at manually specified locations into ROMs.        |

If you have a choice in patch format, choose one that contains CRC32 checksums in the patch file contents (e.g. choose `.bps` over `.ips` if possible).

## ROM checksums

Igir needs to be able to know what source ROM each patch file applies to, and it does this using CRC32 checksums.

A few patch formats include the source ROM's CRC32 checksum in the patch's file contents. This is the most accurate and therefore the best way to get source ROM information. `.bps` is a great example of an efficient and simple patch format that includes this information.

Most patch formats _do not_ include the source ROM's CRC32 checksum. `.ips` patches are some of the most likely you will come across. For those patches, you need to put the source ROM's CRC32 checksum in the patch's filename, either at the beginning or end, like this:

```text
Source ROM filename:
Super Mario Land (World).gb

Patch filename:
Super Mario Land DX v2.0 (World) 90776841.ips
```

```text
Source ROM filename:
NBA Jam - Tournament Edition (USA) (Track 1).bin

Patch filename:
a8f1adf5 NBA Jam 22 v1.4.ppf
```

## Creating ROM patches

Marc Robledo's [Rom Patcher JS](https://www.marcrobledo.com/RomPatcher.js/) site is a great resource for creating ROM patches in a number of common formats without the need to download any tools.
