# igir

A ROM collection manager designed to make one game, one rom (1G1R) sets.

[![npm](https://badgen.net/npm/v/igir?icon=npm)](https://www.npmjs.com/package/igir)
[![GitHub](https://badgen.net/badge/emmercm/metalsmith-vega/purple?icon=github)](https://github.com/emmercm/metalsmith-vega)

## Description

## Installation

With ![Node.js](https://badgen.net/npm/node/igir):

```shell
npx igir [options]
```

## Usage

Here is the `igir --help` help message, which contains a number of use case examples:

```help
 ______   ______   ______  _______  
|      \ /      \ |      \|       \ 
 \$$$$$$|  $$$$$$\ \$$$$$$| $$$$$$$\
  | $$  | $$ __\$$  | $$  | $$__| $$
  | $$  | $$|    \  | $$  | $$    $$
  | $$  | $$ \$$$$  | $$  | $$$$$$$\   ROM collection manager
 _| $$_ | $$__| $$ _| $$_ | $$  | $$
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [commands..] [options]

Commands:
  igir copy    Copy ROM files to a directory
  igir move    Move ROM files to a directory
  igir zip     Create .zip archives when copying or moving ROMs
  igir clean   Remove unmatched files from the ROM output directory
  igir test    Test ROMs for accuracy after writing them
  igir report  Remove unmatched files from the ROM output directory

Path options (inputs support globbing):
  -d, --dat            Path(s) to DAT files                            [array] [required] [default: ["*.dat"]]
  -i, --input          Path(s) to ROM files (including .zip and .7z), these files will not be modified
                                                                                            [array] [required]
  -I, --input-exclude  Path(s) to ROM files to exclude                                                 [array]
  -o, --output         Path to the ROM output directory                                               [string]

Output options:
      --dir-mirror    Use the input subdirectory structure for output subdirectories                 [boolean]
  -D, --dir-dat-name  Use the DAT name as the output subdirectory                                    [boolean]
      --dir-letter    Append the first letter of the ROM name as an output subdirectory              [boolean]
  -s, --single        Output only a single game per parent (1G1R) (requires parent-clone DAT files)  [boolean]
  -Z, --zip-exclude   Glob pattern of files to exclude from zipping                                   [string]
  -O, --overwrite     Overwrite any ROMs in the output directory                                     [boolean]

Priority options:
      --prefer-good            Prefer good ROM dumps over bad                                        [boolean]
  -l, --prefer-language        List of comma-separated languages in priority order (supported: DA, DE, EL, EN,
                                ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)                       [string]
  -r, --prefer-region          List of comma-separated regions in priority order (supported: ARG, ASI, AUS, BR
                               A, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR, MEX, NOR, NZ
                               , POR, RUS, SPA, SWE, TAI, UK, UNK, USA)                               [string]
      --prefer-revision-newer  Prefer newer ROM revisions over older                                 [boolean]
      --prefer-revision-older  Prefer older ROM revisions over newer                                 [boolean]
      --prefer-retail          Prefer retail releases (see --only-retail)                            [boolean]
      --prefer-parent          Prefer parent ROMs over clones (requires parent-clone DAT files)      [boolean]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to (supported: DA, DE, EL, EN, ES, FI, FR,
                          IT, JA, KO, NL, NO, PT, RU, SV, ZH)                                         [string]
  -R, --region-filter    List of comma-separated regions to limit to (supported: ARG, ASI, AUS, BRA, CAN, CHN,
                          DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, S
                         WE, TAI, UK, UNK, USA)                                                       [string]
      --only-bios        Filter to only BIOS files                                                   [boolean]
      --no-bios          Filter out BIOS files                                                       [boolean]
      --no-unlicensed    Filter out unlicensed ROMs                                                  [boolean]
      --only-retail      Filter to only retail releases, enabling all the following flags            [boolean]
      --no-demo          Filter out demo ROMs                                                        [boolean]
      --no-beta          Filter out beta ROMs                                                        [boolean]
      --no-sample        Filter out sample ROMs                                                      [boolean]
      --no-prototype     Filter out prototype ROMs                                                   [boolean]
      --no-test-roms     Filter out test ROMs                                                        [boolean]
      --no-aftermarket   Filter out aftermarket ROMs                                                 [boolean]
      --no-homebrew      Filter out homebrew ROMs                                                    [boolean]
      --no-bad           Filter out bad ROM dumps                                                    [boolean]

Options:
  -h, --help  Show help                                                                              [boolean]

Examples:
  igir copy -i **/*.zip -o 1G1R/ -s -l EN -r USA,EUR,JPN  Produce a 1G1R set per console, preferring English f
                                                          rom USA>EUR>JPN

  igir copy -i **/*.zip -i 1G1R/ -o 1G1R/                 Merge new ROMs into an existing ROM collection

  igir move zip -i 1G1R/ -o 1G1R/                         Organize and zip an existing ROM collection

  igir copy -i **/*.zip -o bios/ --only-bios              Collate all BIOS files
```

## Obtaining DATs

XML-style DAT files that catalog every ROM per system are required for `igir` to work effectively. A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro](https://datomatic.no-intro.org/index.php?page=download&s=64) (cartridge-based systems)
- [Redump](http://redump.org/downloads/) (optical media-based systems)
- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)

## What is a ROM?

## Obtaining ROMs

Emulators are legal, as long as they don't include copyrighted software such as a system BIOS.

Downloading ROM files that you do not own is piracy and is illegal in many countries. Here are some ways you can legally create ROM files from games you own:

- Nintendo - 3DS: [GodMode9](https://github.com/d0k3/GodMode9)
- Nintendo - DS, DSi: [GodMode9i](https://github.com/DS-Homebrew/GodMode9i)
- Nintendo - Game Boy, Game Boy Color, Game Boy Advance: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/) (with an adapter), [GB Operator](https://www.epilogue.co/product/gb-operator)
- Nintendo - Gamecube: [CleanRip](https://wiibrew.org/wiki/CleanRip) (with a Wii)
- Nintendo - Nintendo 64: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/) (with an adapter)
- Nintendo - Nintendo Entertainment System, Famicom: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php)
- Nintendo - Super Nintendo: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/)
- Nintendo - Wii: [CleanRip](https://wiibrew.org/wiki/CleanRip)
- Sega - Genesis / Mega Drive: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/)
- Sega - Master System: [Retrode](https://www.retrode.com/) (with an adapter)
- Sega - Saturn: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)
- Sony - Playstation 1: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)
- Sony - Playstation 2: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)

## Alternative ROM managers

There a few different ROM managers that all attempt to do a lot of the same thing:

- [clrmamepro](https://mamedev.emulab.it/clrmamepro/)
- [Romcenter](http://www.romcenter.com/)
- [Romulus Rom Manager](https://romulus.cc/)

Each manager has its own pros, but many share the same cons:

- Windows-only (sometimes with Wine support), making management on macOS and SoC devices difficult 
- Limited CLI support, making batching and repeatable actions difficult
- UIs that don't clearly state what actions can be or are being performed
- Required proprietary database setup step
- Limited or nonexistent parent/clone, region, language, version, and ROM type filtering
- Limited or nonexistent priorities when creating a 1G1R set
- Limited or nonexistent folder management options
- Limited or nonexistent read-ony or dry-run modes
