# igir

`igir` (pronounced "eager") is a platform-independent ROM collection manager to help sort collections and make one game, one rom (1G1R) sets.

![CLI:Windows,macOS,Linux](https://badgen.net/badge/icon/Windows,%20macOS,%20Linux?icon=terminal&label=CLI&color=grey)
[![npm:igir](https://badgen.net/npm/v/igir?icon=npm&label&color=red)](https://www.npmjs.com/package/igir)
[![GitHub:emmercm/igir](https://badgen.net/badge/emmercm/igir/purple?icon=github)](https://github.com/emmercm/igir)
[![License](https://badgen.net/github/license/emmercm/igir)](https://github.com/emmercm/igir/blob/main/LICENSE)

[![Feature Requests](https://badgen.net/github/label-issues/emmercm/igir/enhancement/open?icon=github&label=Open%20Feature%20Requests)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement)
[![Bugs](https://badgen.net/github/label-issues/emmercm/igir/bug/open?icon=github&label=Open%20Bugs)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Abug)

[![Known Vulnerabilities](https://badgen.net/snyk/emmercm/igir?icon=snyk)](https://snyk.io/test/npm/igir)
[![Test Coverage](https://badgen.net/codecov/c/github/emmercm/igir/main?icon=codecov)](https://codecov.io/gh/emmercm/igir)
[![Maintainability Score](https://badgen.net/codeclimate/maintainability/emmercm/igir?icon=codeclimate)](https://codeclimate.com/github/emmercm/igir/maintainability)

## What does `igir` do?

A video of an example use case:

[![asciicast](https://asciinema.org/a/WU2fDsdVvmStJ2I9FCv9pprQ7.svg)](https://asciinema.org/a/WU2fDsdVvmStJ2I9FCv9pprQ7)

With a large ROM collection it can be difficult to:

- Organize ROM files by console
- Consistently name ROM files
- Archive ROMs individually in mass
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

With [![Node.js](https://badgen.net/npm/node/igir?icon=nodejs)](https://nodejs.org/en/download/) installed, run this from the command line:

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
 _| $$_ | $$__| $$ _| $$_ | $$  | $$   v0.3.0
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [commands..] [options]

Commands:
  igir copy    Copy ROM files from the input to output directory
  igir move    Move ROM files from the input to output directory
  igir zip     Create .zip archives when copying or moving ROMs
  igir test    Test ROMs for accuracy after writing them to the output directory
  igir clean   Recycle unknown files in the output directory
  igir report  Generate a CSV report on the known ROM files found in the input directories

Path options (inputs support globbing):
  -d, --dat            Path(s) to DAT files or archives   [array] [required] [default: ["*.dat"]]
  -i, --input          Path(s) to ROM files or archives, these files will not be modified
                                                                               [array] [required]
  -I, --input-exclude  Path(s) to ROM files to exclude                                    [array]
  -o, --output         Path to the ROM output directory                                  [string]

Input options:
  -H, --header  Glob pattern of files to force header processing for                     [string]

Output options:
      --dir-mirror      Use the input subdirectory structure for output subdirectories  [boolean]
  -D, --dir-dat-name    Use the DAT name as the output subdirectory                     [boolean]
      --dir-letter      Append the first letter of the ROM name as an output subdirectory
                                                                                        [boolean]
  -s, --single          Output only a single game per parent (1G1R) (requires parent-clone DAT fi
                        les)                                                            [boolean]
  -Z, --zip-exclude     Glob pattern of files to exclude from zipping                    [string]
      --remove-headers  Remove known headers from ROMs, optionally limited to a list of comma-sep
                        arated file extensions (supported: .a78, .lnx, .nes, .fds, .smc) [string]
  -O, --overwrite       Overwrite any ROMs in the output directory                      [boolean]

Priority options (requires --single):
      --prefer-good            Prefer good ROM dumps over bad                           [boolean]
  -l, --prefer-language        List of comma-separated languages in priority order (supported: DA
                               , DE, EL, EN, ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)
                                                                                         [string]
  -r, --prefer-region          List of comma-separated regions in priority order (supported: ARG,
                                ASI, AUS, BRA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, I
                               TA, JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA)
                                                                                         [string]
      --prefer-revision-newer  Prefer newer ROM revisions over older                    [boolean]
      --prefer-revision-older  Prefer older ROM revisions over newer                    [boolean]
      --prefer-retail          Prefer retail releases (see --only-retail)               [boolean]
      --prefer-parent          Prefer parent ROMs over clones (requires parent-clone DAT files)
                                                                                        [boolean]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to (supported: DA, DE, EL, EN
                         , ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)               [string]
  -R, --region-filter    List of comma-separated regions to limit to (supported: ARG, ASI, AUS, B
                         RA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR, MEX,
                          NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA)                [string]
      --only-bios        Filter to only BIOS files                                      [boolean]
      --no-bios          Filter out BIOS files                                          [boolean]
      --no-unlicensed    Filter out unlicensed ROMs                                     [boolean]
      --only-retail      Filter to only retail releases, enabling all the following flags
                                                                                        [boolean]
      --no-demo          Filter out demo ROMs                                           [boolean]
      --no-beta          Filter out beta ROMs                                           [boolean]
      --no-sample        Filter out sample ROMs                                         [boolean]
      --no-prototype     Filter out prototype ROMs                                      [boolean]
      --no-test-roms     Filter out test ROMs                                           [boolean]
      --no-aftermarket   Filter out aftermarket ROMs                                    [boolean]
      --no-homebrew      Filter out homebrew ROMs                                       [boolean]
      --no-bad           Filter out bad ROM dumps                                       [boolean]

Help options:
  -v, --verbose  Enable verbose logging, can specify twice (-vv)                          [count]
  -h, --help     Show help                                                              [boolean]

Examples:
  Produce a 1G1R set per console, preferring English from USA>EUR>JPN:
    igir copy --input **/*.zip --output 1G1R/ --dir-dat-name --single --prefer-language EN --pr
  efer-region USA,EUR,JPN

  Merge new ROMs into an existing ROM collection and generate a report:
    igir copy report --input **/*.zip --input ROMs/ --output ROMs/

  Organize and zip an existing ROM collection:
    igir move zip --input ROMs/ --output ROMs/

  Collate all BIOS files into one directory:
    igir copy --input **/*.zip --output BIOS/ --only-bios

  Copy ROMs to a flash cart and test them:
    igir copy test --input ROMs/ --output /media/SDCard/ROMs/ --dir-dat-name --dir-letter

  Make a copy of SNES ROMs without the SMC header that isn't supported by some emulators:
    igir copy --input **/*.smc --output Headerless/ --dir-mirror --remove-headers .smc
```

## What are DATs?

DATs are catalogs of every known ROM per console. A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro P/C XML](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily) (cartridge-based consoles)
  - Note: you can download every console at once from the [daily page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily), but you need to manually select "P/C XML" from the dropdown
- [Redump](http://redump.org/downloads/) (optical media-based consoles)

And some less popular release groups are:

- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)

These catalogs help `igir` distinguish known ROM files in input directories from other files and helps generate reports on ROM collections.

`igir` can currently only process DAT files in the XML format.

## How do I obtain ROMs?

Emulators are generally legal, as long as they don't include copyrighted software such as a console BIOS. Downloading ROM files that you do not own is piracy and is illegal in many countries.

See the [Dumping ROMs](docs/dumping-roms.md) page for more information.

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
- Output report formats that are difficult to parse or filter
- Limited or nonexistent archive extraction support
- Limited or nonexistent ROM header support
- Limited or nonexistent parent/clone, region, language, version, and ROM type filtering
- Limited or nonexistent priorities when creating a 1G1R set
- Limited or nonexistent folder management options
- Limited or nonexistent report-only modes

## Feature requests, bug reports, and contributing

[![Feature Requests](https://badgen.net/github/label-issues/emmercm/igir/enhancement/open?icon=github&label=Open%20Feature%20Requests)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement)
[![Bugs](https://badgen.net/github/label-issues/emmercm/igir/bug/open?icon=github&label=Open%20Bugs)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Abug)

Feedback is a gift! Your feature requests and bug reports help improve the project for everyone. Feel free to submit an issue on GitHub using one of the templates.

Even better, if you feel comfortable writing code, please feel free to submit a pull request against the project!
