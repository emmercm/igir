# DATs

From the [RetroPie docs](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/#dat-files-the-cornerstone):

> DATs describe the ROM contents including filenames, file sizes, and checksums to verify contents are not incorrect or corrupt. DATs are usually maintained either by emulator developers (such as with MAME or FinalBurn Neo) or digital preservation organizations like TOSEC and No-Intro.

Rephrased, DATs are catalogs of every known ROM that exists per console, complete with enough information to identify each file.

These DATs help `igir` distinguish known ROM files in input directories from other files. Because DATs typically contain the complete catalog for console, `igir` also uses them to generate reports for you on what ROMs were found or missing.

`igir` will look for `.dat` files automatically in your working directory, but you can specify an alternative location with:

```shell
igir [commands..] --dat dats/*.dat --input <input>
```

Or you can specify archives that can contain multiple DATs (such as No-Intro's [daily download](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)) with:

```shell
igir [commands..] --dat No-Intro*.zip --input <input>
```

`igir` can currently only process DAT files in the XML format.

## Just tell me what to do

1. Go to the No-Intro DAT-o-MATIC [daily download page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)
2. Select the "P/C XML" option (as opposed to "standard DAT") and download the `.zip` to wherever you store your ROMs
3. Every time you run `igir`, use the `.zip` file you downloaded with:

  ```shell
  igir [commands..] --dat No-Intro*.zip --input <input>
  ```

## DAT groups

A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro P/C XML](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based consoles)
  - Note: you can download every console at once from the [daily page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily), but you need to manually select "P/C XML" from the dropdown
- [Redump](http://redump.org/downloads/) (optical media-based consoles)

And some less popular release groups are:

- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [FinalBurn NEO](https://github.com/libretro/FBNeo/tree/master/dats) (arcade, gen 1-4 consoles)
- [MAME](https://www.progettosnaps.net/dats/MAME/) (arcade)
- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)
