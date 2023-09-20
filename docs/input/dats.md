# DATs

## Overview

From the [RetroPie docs](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/#dat-files-the-cornerstone):

> Once you begin working with software tools to help validate, rebuild, or filter your ROM collection, you will quickly encounter the need for "DAT" files, so named because they usually (but not always!) have the file extension `.dat`.
>
> DATs describe the ROM contents including filenames, file sizes, and checksums to verify contents are not incorrect or corrupt. DATs are usually maintained either by emulator developers (such as with MAME or FinalBurn Neo) or digital preservation organizations like TOSEC and No-Intro.

DATs are catalogs of every known ROM that exists per game system, complete with enough information to identify each file.

These DATs help `igir` distinguish known ROM files in input directories from other files. Because DATs typically contain the complete catalog for a console, `igir` also uses them to generate reports for you on what ROMs were found and which are missing.

The location to your DAT files are specified with the `--dat <path>` option:

```shell
igir [commands..] --dat "dats/*.dat" --input <input>
```

you can even specify archives that can contain multiple DATs (such as No-Intro's [daily download](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)):

```shell
igir [commands..] --dat "No-Intro*.zip" --input <input>
```

## Just tell me what to do

The rest of this page goes into different types of DATs and different groups of people that publish them. If all you want to do is organize your ROMs with `igir` in some sane way, follow these instructions:

1. Go to the No-Intro DAT-o-MATIC [daily download page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)
2. Select the "P/C XML" dropdown option (as opposed to "standard DAT") and download the `.zip` to wherever you store your ROMs
3. Every time you run `igir`, specify the `.zip` file you downloaded with the `--dat <path>` option:

  ```shell
  igir [commands..] --dat "No-Intro*.zip" --input <input>
  ```

## Supported DAT formats

There have been a few DAT-like formats developed over the years. `igir` supports the following:

- [Logiqx XML](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats#logiqx-xml-format) (most common) (No-Intro, Redump, TOSEC, and more)
- [MAME ListXML](https://easyemu.mameworld.info/mameguide/command_line/frontend_commands/listxml.html) (XML exported by the `mame -listxml` command)

  !!! tip

      Instead of exporting the ListXML to a file yourself, you can also specify a MAME executable for the DAT path and then `igir` is smart enough to parse it:

      === ":simple-windowsxp: Windows"

          Windows is fairly easy, MAME is officially compiled for Windows and downloads can be found on many mirror sites.

          ```batch
          igir [commands..] --dat "mame0258b_64bit.exe" --input <input>
          ```

      === ":simple-apple: macOS"

          MAME isn't officially compiled for macOS, you will have to use a third-party release such as [SDL MAME](https://sdlmame.lngn.net/).

          ```shell
          igir [commands..] --dat "mame0258-x86/mame" --input <input>
          ```

      === ":simple-linux: Linux"

          Most distros (Ubuntu, Debian, Fedora, etc.) have MAME in their package repositories, but some will require you to compile MAME yourself. If the `mame` executable is in your `$PATH`, you can specify its path like this:

          ```shell
          igir [commands..] --dat "$(which "mame")" --input <input>
          ```

- [CMPro](http://www.logiqx.com/DatFAQs/CMPro.php)
- [Hardware Target Game Database](https://github.com/frederic-mahe/Hardware-Target-Game-Database) SMDBs that contain file sizes

!!! note

    In case you come across a DAT in a format that `igir` doesn't support, SabreTools supports reading [a number of obscure formats](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats) and converting them to more standard formats such as Logiqx XML.

## DAT input options

The `--dat <path>` supports files, archives, directories, and globs like any of the other file options. See the [file scanning page](file-scanning.md) for more information.

`igir` also supports URLs to DAT files and archives. This is helpful to make sure you're always using the most up-to-date version of a DAT hosted on sites such as GitHub. For example:

```shell
igir [commands..] --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" --input <input>
```

!!! note

    Because of the way [DAT-o-MATIC](https://datomatic.no-intro.org/index.php) prepares & serves downloads, you can't use this method for official No-Intro DATs.

## DAT groups

A number of different release groups maintain sets of DATs, the most popular are:

- [No-Intro](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based consoles)
- [Redump](http://redump.org/downloads/) (optical media-based consoles)
- [MAME](https://www.mamedev.org/release.html) (official "full driver" MAME ListXML)

And some less popular release groups are:

- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)
- [EmulationArchive (trurip)](http://database.trurip.org/)
- [libretro (RetroArch)](https://www.libretro.com/):
  - [Custom DATs](https://github.com/libretro/libretro-database/tree/master/dat) (specific games, some optical media-based consoles)
  - [Mirrored DATs](https://github.com/libretro/libretro-database/tree/master/metadat) (No-Intro and Redump/trurip/TOSEC DATs)
  - [FinalBurn NEO](https://github.com/libretro/FBNeo/tree/master/dats) (arcade, gen 1-4 consoles)
- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP, PS Vita)
- [progetto-SNAPS](https://www.progettosnaps.net/dats/MAME/) (MAME ListXMLs with some unnecessary metadata removed, e.g. inputs, DIP switches, and ports)
- [pleasuredome](https://pleasuredome.github.io/pleasuredome/mame/) (MAME merged, non-merged, and split sets _without_ parent/clone information)

## Parent/clone (P/C) DATs

DATs that include "parent" and "clone" information help `igir` understand what game releases are actually the same game ("clones"). Frequently a game will be released in many regions or with different revisions, usually with only language translations and minor bug fixes. For example, No-Intro has 6+ "clones" of Pokémon Blue cataloged.

Being able to know that many releases are actually the same game gives `igir` the ability to produce "one game, one ROM" (1G1R) sets with the `--single` option. 1G1R sets include only one of these "clone" releases, usually filtered to a language and region, because many people don't care about ROMs they can't understand.

!!! note

    If you have the option to download "parent/clone" or "P/C" versions of DATs, you should always choose those.

## Arcade

Building a ROM set that works with your _exact_ version of [MAME](https://www.mamedev.org/) or FinalBurn [Alpha](https://www.fbalpha.com/) / [Neo](https://github.com/finalburnneo/FBNeo) is necessarily complicated. Arcade machines vary wildly in hardware, they contain many more ROM chips than cartridge-based consoles, their ROM dumps are sometimes imperfect, and arcade emulators prefer "mostly working" emulation over perfect emulation.

The rule-of-thumb with DATs and arcade emulation is: your emulator probably has a companion DAT that describes the _exact_ ROM files it needs and the _exact_ way you have to organize those ROMs. That means:

- ROMs organized with a MAME v0.258 DAT will likely _not_ work with MAME 2003 (v0.78)
- ROMs organized with a MAME v0.258 DAT will likely _not_ work with MAME 2016 (v0.174)
- ROMs organized with a MAME v0.258 DAT will likely _not_ work with FinalBurn
- ROMs organized with a FinalBurn Neo v1.0.0.2 DAT will likely _not_ work with FinalBurn Neo v1.0.0.0
- ROMs organized with a FinalBurn Neo v1.0.0.2 DAT will likely _not_ work with FinalBurn Alpha v0.2.97.29
- ROMs organized with a FinalBurn Alpha v0.2.97.29 DAT will likely _not_ work with FinalBurn Alpha v0.2.96.71

If you are using a desktop frontend such as [RetroArch](../usage/desktop/retroarch.md), it may come with multiple versions of the same emulator, and it is unlikely that any of them is the most recent version. Follow the frontend's documentation to location or download the correct DAT to use with each emulator.

See the [arcade page](../usage/arcade.md) for more information on building & re-building arcade ROM sets.

## Fixdats

"Fixdats" are DATs that contain only ROMs that are missing from your collection. Fixdats are derived from some other DAT (see above for obtaining DATs), containing only a subset of the ROMs. Fixdats are specific to the state of each person's ROM collection, so they aren't necessarily meaningful to other people.

Fixdats help you find files missing from your collection, and they can be used to generate a collection of those files once you've found them. This sub-collection of files can then be merged back into your main collection.

The `--fixdat` option creates a [Logiqx XML](http://www.logiqx.com/DatFAQs/) DAT for every input DAT (the `--dat <path>` option) that is missing ROMs. When writing (`copy`, `move`, and `symlink` commands), the fixdat will be written to the output directory, otherwise it will be written to the working directory.

For example:

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy zip ^
      --dat "Nintendo - Game Boy.dat" ^
      --dat "Nintendo - Game Boy Advance.dat" ^
      --dat "Nintendo - Game Boy Color.dat" ^
      --input ROMs\ ^
      --output ROMs-Sorted\ ^
      --fixdat
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy zip \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --fixdat
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "Nintendo - Game Boy.dat" \
      --dat "Nintendo - Game Boy Advance.dat" \
      --dat "Nintendo - Game Boy Color.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --fixdat
    ```

may produce some fixdats in the `ROMs-Sorted/` directory, if any of the input DATs have ROMs that weren't found in the `ROMs/` input directory:

```text
ROMs-Sorted/
├── Nintendo - Game Boy (20230414-173400) fixdat.dat
├── Nintendo - Game Boy Advance (20230414-173400) fixdat.dat
└── Nintendo - Game Boy Color (20230414-173400) fixdat.dat
```
