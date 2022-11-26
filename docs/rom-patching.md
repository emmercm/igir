# ROM Patching

Patches contain a set of changes that can be applied to a file, turning that file into something different. Common examples for patching ROMs are: translating text to a different language but keeping game logic the same, and fan-made creations such as new levels for an existing game.

Games and their ROMs are protected under copyrights, so patches are used in order to not share copyrighted code online. A person needs the original ROM file plus a patch file in order to get the resulting patched ROM that will be played with an emulator.

## Patch types

There are many, _many_ patch types that ROM hackers use to distribute their changes on the internet ([xkcd "Standards"](https://xkcd.com/927/)). Typically, a patch will only be distributed in one format, so gamers are entirely at the mercy of the ROM hacker's choice.

Not all patch types are created equal. Here are some tables of some existing formats, whether `igir` supports them, and what the patch supports.

**Common patch types:**

| Type                 | Supported    | CRC32 in patch contents | Notes                                                                                                                                                                                                |
|----------------------|--------------|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.bps`               | ✅            | ✅                       |                                                                                                                                                                                                      |
| `.ips`               | ✅ IPS, IPS32 | ❌                       |                                                                                                                                                                                                      |
| `.ppf`               | ✅ 2.0, 3.0   | ❌                       |                                                                                                                                                                                                      |
| `.ups`               | ✅            | ✅                       | ⚠️ UPS patches read and write fies byte-by-byte, making them horribly slow and inefficient. The author, byuu, created `.ups` to replace `.ips`, but then created `.bps` as a replacement for `.ups`. |
| `.vcdiff`, `.xdelta` | ❌            | ❓                       |                                                                                                                                                                                                      |

**Uncommon patch types:**

| Type                | Supported                                              | CRC32 in patch contents | Notes                                                                                                                                 |
|---------------------|--------------------------------------------------------|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `.aps` (GBA)        | ❌                                                      | ❌                       |                                                                                                                                       |
| `.aps` (N64)        | ❌                                                      | ⚠️ only type 1 patches  |                                                                                                                                       |
| `.bdf` (BSDiff)     | ❌                                                      | ❓                       |                                                                                                                                       |
| `.bsp`              | ❌                                                      | ❌                       | Binary Script Patching will probably never be supported, the implementation is [non-trivial](https://github.com/aaaaaa123456789/bsp). |
| `.dps`              | ❌                                                      | ❌                       |                                                                                                                                       |
| `.ebp` (EarthBound) | ❌                                                      | ❌                       |                                                                                                                                       |
| `.ffp`              | ❌                                                      | ❓                       |                                                                                                                                       |
| `.gdiff`            | ❌                                                      | ❓                       |                                                                                                                                       |
| `.mod` (Star Rod)   | ❌                                                      | ❓                       |                                                                                                                                       |
| `.pat` (FireFlower) | ❌                                                      | ❓                       |                                                                                                                                       |
| `.pds`              | ❌                                                      | ❓                       |                                                                                                                                       |
| `.rup` (NINJA 2.0)  | ⚠️ only single file patches, only raw/binary file type | ❌ uses MD5              |                                                                                                                                       |
| `.rxl`              | ❌                                                      | ❓                       |                                                                                                                                       |

If you have a choice in patch format, choose one that contains CRC32 checksums in the patch file contents.

## ROM checksums

`igir` needs to be able to know what source ROM each patch file applies to, and it does this using CRC32 checksums.

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
