# ROM Trimming

!!! warning

    Igir does not support creating trimmed ROMs, it only supports detecting trimmed ROMs and matching them against DAT files. To trim ROMs, you should use a tool such as [NDSToky`oTrim](https://eden.fm/ndstoykotrim/).

ROM chips found in cartridges typically come in sizes that are a power of two (e.g. 32KiB, 128KiB, 64MiB, 2GiB, etc.). Because people in the ROM community value preservation, [ROM dumps](../misc/rom-dumping.md) typically contain full contents of the ROM chip. However, most games don't need _exactly_ all the space on their ROM chip, so there is usually blank space at the end of the ROM in the form of `0x00` or `0xFF` bytes.

It has become common to "trim" this padding at the end of ROM dumps for some handheld consoles, to save space on flash carts. Igir is able to detect ROMs that have been trimmed and add back their padding bytes so that they can be matched against [DAT files](../dats/introduction.md).

Igir can process these file types:

| Console                     | Extension | Most common<br>padding byte | Most common ROM sizes  |
|-----------------------------|-----------|-----------------------------|------------------------|
| Nintendo - 3DS              | `.3ds`    | `0xFF`                      | 0.5, 1, 2 GiB          |
| Nintendo - DS               | `.nds`    | `0x00`                      | 8, 16, 32, 64, 128 MiB |
| Nintendo - Game Boy Advance | `.gba`    | `0x00`                      | 4, 8, 16, 32 MiB       |

Igir can detect these files from their signature even if the file extension is wrong.

If you wish to force trimming detection of other file types (not recommended), you can use the `--trimmed-glob` option like this:

```shell
igir [commands..] --dat <dats> --input <input> --trimmed-glob "*.rom"
```

## Padding strategy

Igir detects the "correct" size for a ROM by rounding the trimmed file's size up to the nearest power of two. Here are some examples:

| Console                     | ROM                                                                                 | Size when trimmed by NDSTokyoTrim v3.11 | Full size     |
|-----------------------------|-------------------------------------------------------------------------------------|-----------------------------------------|---------------|
| Nintendo - 3DS              | `Heroes of Ruin (USA) (En,Fr,Es).3ds`                                               | 494.7MiB (96.6%)                        | 512MiB (2^29) |
| Nintendo - 3DS              | `Steel Diver (USA) (En,Fr,Es).3ds`                                                  | 175.5MiB (68.5%)                        | 256MiB (2^28) |
| Nintendo - 3DS              | `Theatrhythm Final Fantasy - Curtain Call (USA).3ds`                                | 1.7GiB (83.1%)                          | 2GiB (2^31)   |
| Nintendo - DS               | `Kirby - Canvas Curse (USA).nds`                                                    | 50.6MiB (79.0%)                         | 64MiB (2^26)  |
| Nintendo - DS               | `Metroid Prime - Hunters - First Hunt (USA, Australia) (Demo) (Not for Resale).nds` | 14.9MiB (93.1%)                         | 16MiB (2^24)  |
| Nintendo - DS               | `Picross DS (USA) (En,Fr,Es).nds`                                                   | 31.9MiB (99.6%)                         | 32MiB (2^25)  |
| Nintendo - Game Boy Advance | `2 Game Pack! - Uno + Skip-Bo (USA).gba`                                            | 3.9MiB (96.5%)                          | 4MiB (2^22)   |
| Nintendo - Game Boy Advance | `Golden Sun - The Lost Age (USA, Europe).gba`                                       | 15.5MiB (96.7%)                         | 16MiB (2^24)  |
| Nintendo - Game Boy Advance | `Zone of the Enders - The Fist of Mars (USA).gba`                                   | 7.5MiB (94.4%)                          | 8MiB (2^23)   |

Even though each console has a padding byte that is most common (above), this isn't a guarantee, so Igir will calculate two different sets of checksums using both `0x00` and `0xFF` padding bytes.

Like other calculated checksums, checksums of the padded files are cached to speed up subsequent runs.
