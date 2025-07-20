# Introduction to DATs

From the [RetroPie docs](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/#dat-files-the-cornerstone):

> Once you begin working with software tools to help validate, rebuild, or filter your ROM collection, you will quickly encounter the need for "DAT" files, so named because they usually (but not always!) have the file extension `.dat`.
>
> DATs describe the ROM contents including filenames, file sizes, and checksums to verify contents are not incorrect or corrupt. DATs are usually maintained either by emulator developers (such as with MAME or FinalBurn Neo) or digital preservation organizations like TOSEC and No-Intro.

DATs are catalog files of every known ROM that exists per game system, complete with enough information to identify each file.

These DAT files ("DATs") help Igir distinguish known ROM files in input directories from other files. Because DATs typically contain the complete catalog for a console, Igir also uses them to generate reports for you on what ROMs were found and which are missing.

The location to your DAT files are specified with the [`--dat <path>` option](./processing.md#scanning-for-dats):

```shell
igir [commands..] --dat "dats/*.dat" --input <input>
```

you can even specify archives that can contain multiple DATs (such as No-Intro's [daily download](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)):

```shell
igir [commands..] --dat "No-Intro*.zip" --input <input>
```

See the [DAT processing page](./processing.md) for information on how Igir scans for and processes DATs.

## DAT release groups

A number of different release groups maintain sets of DATs, the most popular are:

- [No-Intro](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based consoles)
- [Redump](http://redump.org/downloads/) (optical media-based consoles)
- [MAME](https://www.mamedev.org/release.html) (official "full driver" MAME ListXML)

And some less popular release groups are:

- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)
- [GoodTools](https://github.com/Eggmansworld/Datfiles/releases/tag/goodtools) (home computers, gen 1-5 consoles)
- [EmulationArchive (trurip)](http://database.trurip.org/)
- [libretro (RetroArch)](https://www.libretro.com/):
  - [Custom DATs](https://github.com/libretro/libretro-database/tree/master/dat) (specific games, some optical media-based consoles)
  - [Mirrored DATs](https://github.com/libretro/libretro-database/tree/master/metadat) (No-Intro and Redump/trurip/TOSEC DATs)
  - [FinalBurn NEO](https://github.com/libretro/FBNeo/tree/master/dats) (arcade, gen 1-4 consoles)
- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP, PS Vita)
- Arcade:
  - [progetto-SNAPS](https://www.progettosnaps.net/dats/MAME/) (MAME ListXMLs with some unnecessary metadata removed, e.g. inputs, DIP switches, and ports)
  - [pleasuredome](https://pleasuredome.github.io/pleasuredome/mame/) (MAME merged, non-merged, and split sets _without_ parent/clone information)
  - [TeknoParrot](https://github.com/Eggmansworld/Datfiles/releases/tag/teknoparrot) (modern arcade)

## Parent/clone (P/C) DATs

DATs that include "parent" and "clone" information help Igir understand what game releases are actually the same game (are "clones" of each other). Frequently, a game will be released in many regions or with different revisions, usually with only language translations and minor bug fixes. For example, No-Intro has 6+ "clones" of Pokémon Blue cataloged.

Being able to know that many releases are actually the same game gives Igir the ability to produce "one game, one ROM" (1G1R) sets with the [`--single` option](../roms/filtering-preferences.md#preferences-for-1g1r). 1G1R sets include only one of these "clone" releases, usually filtered to a language and region, because many people don't care about ROMs they can't understand.

!!! note

    If you have the option to download "parent/clone" or "P/C" versions of DATs, you should always choose those as they contain the most amount of game information.

## Arcade DATs

Building a ROM set that works with your _exact_ version of [MAME](https://www.mamedev.org/) or FinalBurn [Alpha](https://www.fbalpha.com/) / [Neo](https://github.com/finalburnneo/FBNeo) is necessarily complicated. Arcade machines vary wildly in hardware, they contain many more ROM chips than cartridge-based consoles, their ROM dumps are sometimes imperfect, and arcade emulators prefer "mostly working" emulation over perfect emulation.

The rule-of-thumb with DATs and arcade emulation is: your emulator probably has a companion DAT that describes the _exact_ ROM files it needs and the _exact_ way you have to organize those ROMs. That means:

- ROMs organized with a MAME v0.258 DAT will likely _not_ work with MAME 2003 (v0.78)
- ROMs organized with a MAME v0.258 DAT will likely _not_ work with MAME 2016 (v0.174)
- ROMs organized with a MAME v0.258 DAT will likely _not_ work with FinalBurn
- ROMs organized with a FinalBurn Neo v1.0.0.2 DAT will likely _not_ work with FinalBurn Neo v1.0.0.0
- ROMs organized with a FinalBurn Neo v1.0.0.2 DAT will likely _not_ work with FinalBurn Alpha v0.2.97.29
- ROMs organized with a FinalBurn Alpha v0.2.97.29 DAT will likely _not_ work with FinalBurn Alpha v0.2.96.71

If you are using a desktop frontend such as [RetroArch](../usage/desktop/retroarch.md), it may come with multiple versions of the same emulator, and it is unlikely that any of them is the most recent version. Follow the frontend's documentation to location or download the correct DAT to use with each emulator.

See the [arcade usage page](../usage/arcade.md) for more information on building & re-building arcade ROM sets.

## Next steps

See the [DAT processing page](./processing.md) for information on how Igir scans for and processes DATs.
