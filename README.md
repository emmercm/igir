# igir

`igir` (pronounced "eager") is a platform-independent ROM collection manager to help sort collections and make one game, one rom (1G1R) sets.

![CLI:Windows,macOS,Linux](https://badgen.net/badge/icon/Windows,%20macOS,%20Linux?icon=terminal&label=CLI&color=grey)
[![npm:igir](https://badgen.net/npm/v/igir?icon=npm&label&color=red)](https://www.npmjs.com/package/igir)
[![GitHub:emmercm/igir](https://badgen.net/badge/emmercm/igir/purple?icon=github)](https://github.com/emmercm/igir)
[![License](https://badgen.net/github/license/emmercm/igir)](https://github.com/emmercm/igir/blob/main/LICENSE)

[![Known Vulnerabilities](https://badgen.net/snyk/emmercm/igir?icon=snyk)](https://snyk.io/test/npm/igir)
[![Test Coverage](https://badgen.net/codecov/c/github/emmercm/igir/main?icon=codecov)](https://codecov.io/gh/emmercm/igir)
[![Maintainability Score](https://badgen.net/codeclimate/maintainability/emmercm/igir?icon=codeclimate)](https://codeclimate.com/github/emmercm/igir/maintainability)

## What does `igir` do?

A video of an example use case:

[![asciicast](https://asciinema.org/a/iTnSVX8VTLSZNcCMFtqy5T9Mo.svg)](https://asciinema.org/a/iTnSVX8VTLSZNcCMFtqy5T9Mo)

With a large ROM collection it can be difficult to:

- Organize ROM files by console
- Consistently name ROM files
- Consistently archive ROMs in mass
- Filter out duplicate ROMs
- Filter out ROMs for languages you don't understand
- Know what ROMs are missing for each console

`igir` helps solve all of these problems!

## How does `igir` work?

`igir` needs two sets of files:

1. ROMs, including ones with [headers](https://no-intro.org/faq.htm)
2. One or more DATs ([see below](#what-are-dats) for where to download)

Many different input archive types are supported for both ROMs and DATs: .001, .7z, .bz2, .gz, .rar, .tar, .tgz, .xz, .z, .z01, .zip, .zipx, and more!

`igir` then needs one or more commands:

- `copy`: copy ROMs from input directories to an output directory
- `move`: move ROMs from input directories to an output directory
- `zip`: create zip archives of output ROMs
- `test`: test all written ROMs for accuracy
- `clean`: recycle all unknown files in an output directory
- `report`: generate a report on ROMs found and processed

## How do I run `igir`?

With [![Node.js](https://badgen.net/npm/node/igir?icon=nodejs)](https://nodejs.org/en/download/) installed, run from the command line:

```shell
npx igir@latest [commands..] [options]
```

Here is the full `igir --help` message which shows all available options and a number of common use case examples:

```help
 ______   ______   ______  _______
|      \ /      \ |      \|       \
 \$$$$$$|  $$$$$$\ \$$$$$$| $$$$$$$\
  | $$  | $$ __\$$  | $$  | $$__| $$
  | $$  | $$|    \  | $$  | $$    $$   ROM collection manager
  | $$  | $$ \$$$$  | $$  | $$$$$$$\
 _| $$_ | $$__| $$ _| $$_ | $$  | $$   v0.2.0
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [commands..] [options]

Commands:
  igir copy    Copy ROM files from the input to output directory
  igir move    Move ROM files from the input to output directory
  igir zip     Create .zip archives when copying or moving ROMs
  igir test    Test ROMs for accuracy after writing them to the output directory
  igir clean   Recycle unknown files in the output directory
  igir report  Generate a report on the known ROM files found in the input directories

Path options (inputs support globbing):
  -d, --dat            Path(s) to DAT files or archives [array] [required] [default: ["*.dat"]]
  -i, --input          Path(s) to ROM files or archives, these files will not be modified
                                                                             [array] [required]
  -I, --input-exclude  Path(s) to ROM files to exclude                                  [array]
  -o, --output         Path to the ROM output directory                                [string]

Input options:
  -H, --header  Glob pattern of files to force header processing for                   [string]

Output options:
      --dir-mirror    Use the input subdirectory structure for output subdirectories  [boolean]
  -D, --dir-dat-name  Use the DAT name as the output subdirectory                     [boolean]
      --dir-letter    Append the first letter of the ROM name as an output subdirectory
                                                                                      [boolean]
  -s, --single        Output only a single game per parent (1G1R) (requires parent-clone DAT fi
                      les)                                                            [boolean]
  -Z, --zip-exclude   Glob pattern of files to exclude from zipping                    [string]
  -O, --overwrite     Overwrite any ROMs in the output directory                      [boolean]

Priority options (requires --single):
      --prefer-good            Prefer good ROM dumps over bad                         [boolean]
  -l, --prefer-language        List of comma-separated languages in priority order (supported:
                               DA, DE, EL, EN, ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)
                                                                                       [string]
  -r, --prefer-region          List of comma-separated regions in priority order (supported: AR
                               G, ASI, AUS, BRA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HO
                               L, ITA, JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK
                               , USA)                                                  [string]
      --prefer-revision-newer  Prefer newer ROM revisions over older                  [boolean]
      --prefer-revision-older  Prefer older ROM revisions over newer                  [boolean]
      --prefer-retail          Prefer retail releases (see --only-retail)             [boolean]
      --prefer-parent          Prefer parent ROMs over clones (requires parent-clone DAT files)
                                                                                      [boolean]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to (supported: DA, DE, EL,
                         EN, ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)           [string]
  -R, --region-filter    List of comma-separated regions to limit to (supported: ARG, ASI, AUS,
                          BRA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR,
                         MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA)          [string]
      --only-bios        Filter to only BIOS files                                    [boolean]
      --no-bios          Filter out BIOS files                                        [boolean]
      --no-unlicensed    Filter out unlicensed ROMs                                   [boolean]
      --only-retail      Filter to only retail releases, enabling all the following flags
                                                                                      [boolean]
      --no-demo          Filter out demo ROMs                                         [boolean]
      --no-beta          Filter out beta ROMs                                         [boolean]
      --no-sample        Filter out sample ROMs                                       [boolean]
      --no-prototype     Filter out prototype ROMs                                    [boolean]
      --no-test-roms     Filter out test ROMs                                         [boolean]
      --no-aftermarket   Filter out aftermarket ROMs                                  [boolean]
      --no-homebrew      Filter out homebrew ROMs                                     [boolean]
      --no-bad           Filter out bad ROM dumps                                     [boolean]

Help options:
  -v, --verbose  Enable verbose logging, can specify twice (-vv)                        [count]
  -h, --help     Show help                                                            [boolean]

Examples:
  igir copy -i **/*.zip -o 1G1R/ -D -s -l EN -r U  Produce a 1G1R set per console, preferring E
  SA,EUR,JPN                                       nglish from USA>EUR>JPN

  igir copy report -i **/*.zip -i ROMs/ -o ROMs/   Merge new ROMs into an existing ROM collecti
                                                   on and generate a report

  igir move zip -i ROMs/ -o ROMs/                  Organize and zip an existing ROM collection

  igir copy -i **/*.zip -o BIOS/ --only-bios       Collate all BIOS files

  igir copy -i ROMs/ -o /media/SDCard/ROMs/ -D --  Copy ROMs to a flash cart and test them
  dir-letter -t
```

## What are DATs?

DATs are catalogs of every known ROM per system. A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro P/C XML](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based systems)
  - Note: you can download every console at once from the [daily page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily), but you need to manually select "P/C XML" from the dropdown
- [Redump](http://redump.org/downloads/) (optical media-based systems)

And some less popular release groups are:

- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)

These catalogs help `igir` distinguish known ROM files in input directories from other files and helps generate reports on ROM collections.

`igir` can currently process DAT files in the XML format only.

## How do I obtain ROMs?

Emulators are generally legal, as long as they don't include copyrighted software such as a system BIOS. Downloading ROM files that you do not own is piracy and is illegal in many countries.

[Dumping.Guide](https://dumping.guide/start) and  [Emulation General Wiki](https://emulation.gametechwiki.com/index.php/Ripping_games) are some of the best resources for legally creating ROM files from games you own. Here is a condensed version that isn't guaranteed to be up-to-date:

| Dumpable with special hardware | [Open Source Cartridge Reader](https://github.com/sanni/cartreader)<br/>([Save the Hero Builders](https://savethehero.builders/)) | [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php) | [Retrode](https://www.retrode.com/)            | Other hardware                                             |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|------------------------------------------------|------------------------------------------------------------|
| Nintendo - GB, GBC, GBA        | ✅                                                                                                                                 | ✅                                                                | ✅ (w/ adapter)                                 | [GB Operator](https://www.epilogue.co/product/gb-operator) |
| Nintendo - NES/Famicom         | ✅ (V3 w/ adapter)                                                                                                                 | ✅                                                                |                                                |                                                            |
| Nintendo - Nintendo 64         | ✅ including controller pak saves (V3 w/ addon for EEPROM saves)                                                                   | ✅                                                                | ✅ including controller park saves (w/ adapter) |                                                            |
| Nintendo - SNES/SFC            | ✅ (V3 w/ addon for some)                                                                                                          | ✅                                                                | ✅                                              |                                                            |
| Sega - Game Gear               | ✅ (w/ Retrode Master System adapter)                                                                                              |                                                                  | ✅ (w/ Master System adapter)                   |                                                            |
| Sega - Genesis/MD              | ✅                                                                                                                                 | ✅                                                                | ✅                                              |                                                            |
| Sega - Master System           | ✅ (V3 w/ adapter)                                                                                                                 |                                                                  | ✅ (w/ adapter)                                 |                                                            |

| Dumpable without special hardware | [Media Preservation Frontend (MPF)](https://github.com/SabreTools/MPF) (w/ PC) | With a console                                                                                                                                                                                                                  |
|-----------------------------------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Microsoft - Xbox, 360, One        | ✅                                                                              |                                                                                                                                                                                                                                 |
| Nintendo - 3DS                    |                                                                                | [GodMode9](https://github.com/d0k3/GodMode9) (w/ 3DS)                                                                                                                                                                           |
| Nintendo - DS, DSi                |                                                                                | [GodMode9](https://github.com/d0k3/GodMode9) (w/ 3DS), [GodMode9i](https://github.com/DS-Homebrew/GodMode9i) (w/ DSi), [wooddumper](https://dumping.guide/carts/nintendo/ds#method_4_-_ds_console_via_slot-2_flashcart) (w/ DS) |
| Nintendo - Famicom Disk           |                                                                                | [FDSStick](https://3dscapture.com/fdsstick/)                                                                                                                                                                                    |
| Nintendo - Gamecube               | ⚠️ with specific drives and workarounds                                        | [CleanRip](https://wiibrew.org/wiki/CleanRip) (w/ Wii)                                                                                                                                                                          |
| Nintendo - Switch                 |                                                                                | [nxdumptool](https://github.com/DarkMatterCore/nxdumptool/tree/main)                                                                                                                                                            |
| Nintendo - Wii                    | ⚠️ with specific drives and workarounds                                        | [CleanRip](https://wiibrew.org/wiki/CleanRip)                                                                                                                                                                                   |
| Nintendo - Wii U                  | ❌                                                                              | [wudump](https://github.com/FIX94/wudump)                                                                                                                                                                                       |
| Sega - Dreamcast                  | ⚠️ with specific drives and workarounds                                        | [SD Rip](https://hiddenpalace.org/Dreamcast_SD_Rip)                                                                                                                                                                             |
| Sega - Saturn                     | ✅                                                                              |                                                                                                                                                                                                                                 |
| Sony - PlayStation 1, 2           | ✅                                                                              |                                                                                                                                                                                                                                 |
| Sony - PlayStation 3              | ❌                                                                              | [ManaGunZ](https://github.com/Zarh/ManaGunZ), [multiMAN](https://store.brewology.com/ahomebrew.php?brewid=24)                                                                                                                   |
| Sony - PSP                        |                                                                                | [PSP Filer](http://wiki.redump.org/index.php?title=PlayStation_Portable_Dumping_Guide)                                                                                                                                          |
| Sony - PlayStation Vita           |                                                                                | [psvgamesd](https://github.com/motoharu-gosuto/psvgamesd)                                                                                                                                                                       |

## Why choose `igir`?

There a few different popular ROM managers that have similar features:

- [clrmamepro](https://mamedev.emulab.it/clrmamepro/)
- [Romcenter](http://www.romcenter.com/)
- [Romulus](https://romulus.cc/)
- [RomVault](https://www.romvault.com/)

Each manager has its own pros, but most share the same cons:

- Windows-only (sometimes with Wine support), making management on macOS and Linux difficult
- Limited CLI support, making batching and repeatable actions difficult
- UIs that don't clearly state what actions can, will, or are being performed
- Required proprietary database setup step
- Limited or nonexistent archive extraction support
- Limited or nonexistent ROM header support
- Limited or nonexistent parent/clone, region, language, version, and ROM type filtering
- Limited or nonexistent priorities when creating a 1G1R set
- Limited or nonexistent folder management options
- Limited or nonexistent report-only modes
