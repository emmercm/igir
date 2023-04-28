# DATs

From the [RetroPie docs](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/#dat-files-the-cornerstone):

> Once you begin working with software tools to help validate, rebuild, or filter your ROM collection, you will quickly encounter the need for "DAT" files, so named because they usually (but not always!) have the file extension `.dat`.
>
> DATs describe the ROM contents including filenames, file sizes, and checksums to verify contents are not incorrect or corrupt. DATs are usually maintained either by emulator developers (such as with MAME or FinalBurn Neo) or digital preservation organizations like TOSEC and No-Intro.

DATs are catalogs of every known ROM that exists per game system, complete with enough information to identify each file.

These DATs help `igir` distinguish known ROM files in input directories from other files. Because DATs typically contain the complete catalog for a console, `igir` also uses them to generate reports for you on what ROMs were found and which are missing.

`igir` will look for `.dat` files automatically in your working directory, but you can specify a specific location with the `--dat` option:

```shell
igir [commands..] --dat dats/*.dat --input <input>
```

Or you can specify archives that can contain multiple DATs (such as No-Intro's [daily download](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)) with:

```shell
igir [commands..] --dat No-Intro*.zip --input <input>
```

**`igir` can process DAT files in [XML](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats#logiqx-xml-format) and [CMPro](http://www.logiqx.com/DatFAQs/CMPro.php) formats, as well as [Hardware Target Game Database](https://github.com/frederic-mahe/Hardware-Target-Game-Database) SMDBs that contain file sizes.**

!!! info

    See the [file scanning docs](file-scanning.md) for more information on specify files with the `--dat` option.

## Just tell me what to do

1. Go to the No-Intro DAT-o-MATIC [daily download page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)
2. Select the "P/C XML" dropdown option (as opposed to "standard DAT") and download the `.zip` to wherever you store your ROMs
3. Every time you run `igir`, specify the `.zip` file you downloaded with the `--dat` option:

  ```shell
  igir [commands..] --dat No-Intro*.zip --input <input>
  ```

## DAT groups

A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based consoles)
- [Redump](http://redump.org/downloads/) (optical media-based consoles)

And some less popular release groups are:

- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)
- [EmulationArchive (trurip)](http://database.trurip.org/)
- [libretro](https://www.libretro.com/):
  - [Custom DATs](https://github.com/libretro/libretro-database/tree/master/dat) (specific games, some optical media-based consoles)
  - [DAT Mirrors](https://github.com/libretro/libretro-database/tree/master/metadat) (No-Intro and Redump/trurip/TOSEC DATs)
  - [FinalBurn NEO](https://github.com/libretro/FBNeo/tree/master/dats) (arcade, gen 1-4 consoles)
- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [progetto-SNAPS](https://www.progettosnaps.net/dats/MAME/) (MAME)
- [pleasuredome](https://pleasuredome.github.io/pleasuredome/mame/) (MAME)

## Parent/clone (P/C)

DATs that include "parent" and "clone" information help `igir` understand what game releases are actually the same game ("clones"). Frequently a game will be released in many regions or with different revisions, usually with only language translations and minor bug fixes. For example, No-Intro has 6+ "clones" of Pokémon Blue cataloged.

Being able to know that many releases are actually the same game gives `igir` the ability to produce "one game, one ROM" (1G1R) sets with the `--single` option. 1G1R sets include only one of these "clone" releases, usually filtered to a language and region, because many people don't care about ROMs they can't understand.

!!! note

    If you have the option to download "parent/clone" or "P/C" versions of DATs, you should always choose those.

## Aren't DATs primarily for MAME?

That's where DATs started. The [Logiqx XML](http://www.logiqx.com/DatFAQs/) DAT format can include information in [clrmamepro](https://mamedev.emulab.it/clrmamepro/) or [Romcenter](http://www.romcenter.com/) formats on how to handle MAME-specific settings such as [merging](https://docs.mamedev.org/usingmame/aboutromsets.html#parents-clones-splitting-and-merging) (non-merged vs. merged vs. split) and packing (zip vs. not). `igir` doesn't use any of this information, but it helps paint a picture of why DATs are structured the way they are.

These days, depending on what type of emulation you're interested in, non-MAME DATs such as No-Intro's may be more common than MAME DATs. See the [DAT groups](#dat-groups) section above for some of the popular DAT release groups.

## Fixdats

"Fixdats" are DATs that contain only ROMs that are missing from your collection. Fixdats are derived from some other DAT (see above for obtaining DATs), containing only a subset of the ROMs. Fixdats are specific to the state of each person's ROM collection, they aren't necessarily meaningful to other people.

Fixdats help you find files missing from your collection, and they can be used to generate a collection of those files once you've found them. This sub-collection of files can then be merged back into your main collection.

The `--fixdat` option create a [Logiqx XML](http://www.logiqx.com/DatFAQs/) DAT in the output directory for every input DAT (`--dat`) that is missing ROMs. For example:

```shell
igir copy zip --dat "Nintendo - Game Boy.dat" \
  --dat "Nintendo - Game Boy Advance.dat" \
  --dat "Nintendo - Game Boy Color.dat" \
  --input ROMs/
  --output ROMs-Sorted/
  --fixdat
```

may produce some fixdats in the `ROMs-Sorted/` directory, if any of the input DATs have ROMs that weren't found in the `ROMs/` input directory:

```text
ROMs-Sorted/
├── Nintendo - Game Boy (20230414-173400) fixdat.dat
├── Nintendo - Game Boy Advance (20230414-173400) fixdat.dat
└── Nintendo - Game Boy Color (20230414-173400) fixdat.dat
```
