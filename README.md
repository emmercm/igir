# igir

`igir` (pronounced "eager") is a platform-independent ROM collection manager to help sort collections and make one game, one rom (1G1R) sets.

![CLI:Windows,macOS,Linux](https://badgen.net/badge/icon/Windows,%20macOS,%20Linux?icon=terminal&label=CLI&color=grey)
[![npm:igir](https://badgen.net/npm/v/igir?icon=npm&label=igir&color=red)](https://www.npmjs.com/package/igir)
[![GitHub:emmercm/igir](https://badgen.net/badge/emmercm/igir/purple?icon=github)](https://github.com/emmercm/igir)
[![License](https://badgen.net/github/license/emmercm/igir)](https://github.com/emmercm/igir/blob/main/LICENSE)

[![Known Vulnerabilities](https://badgen.net/snyk/emmercm/igir?icon=snyk)](https://snyk.io/test/npm/igir)
[![Test Coverage](https://badgen.net/codecov/c/github/emmercm/igir/main?icon=codecov)](https://codecov.io/gh/emmercm/igir)
[![Maintainability Score](https://badgen.net/codeclimate/maintainability/emmercm/igir?icon=codeclimate)](https://codeclimate.com/github/emmercm/igir/maintainability)

## What does `igir` do?

A video of an example use case:

[![asciicast](https://asciinema.org/a/uVZpMCas3SQIA0q6sCh5rYqdI.svg)](https://asciinema.org/a/uVZpMCas3SQIA0q6sCh5rYqdI)

With a large ROM collection it can be difficult to:

- Organize ROM files by console
- Consistently name ROM files
- Make sure ROMs have the right extension
- Archive ROMs individually in mass
- Filter out duplicate ROMs
- Filter out ROMs for languages you don't understand
- Know what ROMs are missing for each console

`igir` helps solve all of these problems!

## What does `igir` need?

**`igir` needs an input set of ROMs, of course!**

Those ROMs can be in archives (`.001`, `.7z`, `.gz`, `.rar`, `.tar.gz`, `.z01`, `.zip`, `.zipx`, and more!) or on their own. They can also contain a header or not (see [docs](docs/rom-headers.md)).

**`igir` works best with a set of DATs as well.**

Though not required, DATs can provide a lot of information for ROMs such as their correct name, and which ROMs are duplicates of others. See the [docs](docs/dats.md) for more information on DATs and some "_just tell me what to do_" instructions.

**`igir` then needs one or more commands:**

- `copy`: copy ROMs from input directories to an output directory
- `move`: move ROMs from input directories to an output directory
- `zip`: create zip archives of output ROMs
- `test`: test all written ROMs for accuracy
- `clean`: recycle all unknown files in an output directory
- `report`: generate a report on ROMs found and processed

The `igir --help` command shown below includes examples of how to use multiple commands together.

## How does `igir` work?

`igir` runs these steps in the following order:

1. Scans the DAT input path for every file and parses them, if specified
2. Scans each ROM input path for every file
   1. Then detects headers in those files, if applicable (see [docs](docs/rom-headers.md))
3. ROMs are matched to the DATs
   1. Then filtering and sorting options are applied (see [docs](docs/rom-filtering.md))
   2. Then ROMs are written to the output directory, if specified (`copy`, `move`)
   3. Then written ROMs are tested for accuracy, if specified (`test`)
   4. Then input ROMs are deleted, if specified (`move`)
4. Unknown files are recycled from the output directory, if specified (`clean`)
5. An output report is written to the output directory, if specified (`report`)

## How do I run `igir`?

With [![Node.js](https://badgen.net/npm/node/igir?icon=nodejs&label=Node.js)](https://nodejs.org/en/download/) installed, run this from the command line:

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
 _| $$_ | $$__| $$ _| $$_ | $$  | $$   v0.4.0
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
  -d, --dat            Path(s) to DAT files or archives                                   [array]
  -i, --input          Path(s) to ROM files or archives, these files will not be modified
                                                                               [array] [required]
  -I, --input-exclude  Path(s) to ROM files to exclude                                    [array]
  -o, --output         Path to the ROM output directory                                  [string]

Input options:
      --header  Glob pattern of files to force header processing for                     [string]

Output options:
      --dir-mirror      Use the input subdirectory structure for output subdirectories  [boolean]
  -D, --dir-dat-name    Use the DAT name as the output subdirectory                     [boolean]
      --dir-letter      Append the first letter of the ROM name as an output subdirectory
                                                                                        [boolean]
  -Z, --zip-exclude     Glob pattern of files to exclude from zipping                    [string]
  -H, --remove-headers  Remove known headers from ROMs, optionally limited to a list of comma-sep
                        arated file extensions (supported: .a78, .fds, .lnx, .nes, .smc) [string]
  -O, --overwrite       Overwrite any ROMs in the output directory                      [boolean]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to (supported: DA, DE, EL, EN
                         , ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)               [string]
  -R, --region-filter    List of comma-separated regions to limit to (supported: ARG, ASI, AUS, B
                         RA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR, MEX,
                          NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA)                [string]
      --only-bios        Filter to only BIOS files                                      [boolean]
      --no-bios          Filter out BIOS files                                          [boolean]
      --no-unlicensed    Filter out unlicensed ROMs                                     [boolean]
      --only-retail      Filter to only retail releases, enabling all the following options
                                                                                        [boolean]
      --no-demo          Filter out demo ROMs                                           [boolean]
      --no-beta          Filter out beta ROMs                                           [boolean]
      --no-sample        Filter out sample ROMs                                         [boolean]
      --no-prototype     Filter out prototype ROMs                                      [boolean]
      --no-test-roms     Filter out test ROMs                                           [boolean]
      --no-aftermarket   Filter out aftermarket ROMs                                    [boolean]
      --no-homebrew      Filter out homebrew ROMs                                       [boolean]
      --no-unverified    Filter out un-verified ROMs                                    [boolean]
      --no-bad           Filter out bad ROM dumps                                       [boolean]

Priority options:
  -s, --single                 Output only a single game per parent (1G1R) (required for all opti
                               ons below, requires parent/clone DAT files)              [boolean]
      --prefer-verified        Prefer verified ROM dumps over not                       [boolean]
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

Help options:
  -v, --verbose  Enable verbose logging, can specify twice (-vv)                          [count]
  -h, --help     Show help                                                              [boolean]

Examples:
  Produce a 1G1R set per console, preferring English ROMs from USA>EUR>JPN:
    igir copy --dat *.dat --input **/*.zip --output 1G1R/ --dir-dat-name --single --prefer-lang
  uage EN --prefer-region USA,EUR,JPN

  Merge new ROMs into an existing ROM collection and generate a report:
    igir copy report --dat *.dat --input **/*.zip --input ROMs/ --output ROMs/

  Organize and zip an existing ROM collection:
    igir move zip --dat *.dat --input ROMs/ --output ROMs/

  Collate all BIOS files into one directory:
    igir copy --dat *.dat --input **/*.zip --output BIOS/ --only-bios

  Copy ROMs to a flash cart and test them:
    igir copy test --dat *.dat --input ROMs/ --output /media/SDCard/ROMs/ --dir-dat-name --dir-
  letter

  Make a copy of SNES ROMs without the SMC header that isn't supported by some emulators:
    igir copy --dat *.dat --input **/*.smc --output Headerless/ --dir-mirror --remove-headers .
  smc
```

## How do I obtain ROMs?

Emulators are generally _legal_, as long as they don't include copyrighted software such as a console BIOS. Downloading ROM files that you do not own is piracy which is _illegal_ in many countries.

See the [Dumping ROMs](docs/rom-dumping.md) page for more information.

## Why choose `igir`?

There a few different popular ROM managers that have similar features:

- [clrmamepro](https://mamedev.emulab.it/clrmamepro/)
- [Romcenter](http://www.romcenter.com/)
- [Romulus](https://romulus.cc/)
- [RomVault](https://www.romvault.com/)

Each manager has its own pros, but many have the same drawbacks or limitations:

- Windows-only (sometimes with Wine support), making management on macOS and Linux difficult
- Limited CLI support, making batching and repeatable actions difficult
- UIs that don't clearly state what actions can, will, or are being performed
- Confusing required setup steps
- No report-only modes
- Output report formats that are difficult to parse or filter
- Limited archive extraction support
- Limited folder management options
- No ROM header support
- No ROM header removal functionality
- Limited parent/clone, region, language, version, and ROM type filtering
- No ability to prioritize parent/clones when creating a 1G1R set

## Feature requests, bug reports, and contributing

[![Contributors](https://badgen.net/github/contributors/emmercm/igir?icon=github)](https://github.com/emmercm/igir/graphs/contributors)
[![Feature Requests](https://badgen.net/github/label-issues/emmercm/igir/enhancement/open?icon=github&label=Open%20Feature%20Requests)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement)
[![Bugs](https://badgen.net/github/label-issues/emmercm/igir/bug/open?icon=github&label=Open%20Bugs)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Abug)

Feedback is a gift! Your feature requests and bug reports help improve the project for everyone. Feel free to submit an issue on GitHub using one of the templates.

Even better, if you feel comfortable writing code, please feel free to submit a pull request against the project!
