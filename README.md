<h1 align="center">🕹️ igir</h1>

<p align="center" style="font-weight:bold;">Pronounced "eager", `igir` is a platform-independent ROM collection manager to help filter, sort, patch, and archive ROM collections.</p>

![CLI: Windows,macOS,Linux](https://img.shields.io/badge/CLI-Windows%2C%20macOS%2C%20Linux-lightgrey?logo=windows-terminal)
[![npm: version](https://img.shields.io/npm/v/igir?color=%23cc3534&label=version&logo=npm&logoColor=white)](https://www.npmjs.com/package/igir)
[![npm: downloads](https://img.shields.io/npm/dw/igir?color=%23cc3534&logo=npm&logoColor=white)](https://www.npmjs.com/package/igir)
[![GitHub: stars](https://img.shields.io/github/stars/emmercm/igir?color=%236e5494&logo=github&logoColor=white)](https://github.com/emmercm/igir)

[![Snyk: vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/igir?logo=snyk&logoColor=white)](https://snyk.io/test/npm/igir)
[![codecov: coverage](https://img.shields.io/codecov/c/github/emmercm/igir?logo=codecov&logoColor=white)](https://codecov.io/gh/emmercm/igir)
[![Code Climate: maintainability](https://img.shields.io/codeclimate/maintainability-percentage/emmercm/igir?logo=codeclimate&logoColor=white)](https://codeclimate.com/github/emmercm/igir/maintainability)
[![license](https://img.shields.io/github/license/emmercm/igir?color=blue)](https://github.com/emmercm/igir/blob/main/LICENSE)

## What does `igir` do?

A video of an example use case:

[![asciicast](https://asciinema.org/a/AwESXP8AI5xrm9DCdbZGjNtYF.svg)](https://asciinema.org/a/AwESXP8AI5xrm9DCdbZGjNtYF)

With `igir` you can manage a ROM collection of any size:

- 🔍 Scan for DATs, ROMs, and ROM patches - including those in archives (see [archive docs](docs/advanced-topics.md#supported-archive-formats))
- 📂 Organize ROM files by console (see [DAT docs](docs/dats.md))
- 🪄 Name ROM files consistently, including the right extension (see [DAT docs](docs/dats.md))
- ✂️ Filter out duplicate ROMs, or ROMs in languages you don't understand (see [filtering docs](docs/rom-filtering.md))
- 🗜️ Extract or archive ROMs in mass (see [archive docs](docs/advanced-topics.md#supported-archive-formats))
- 🩹 Patch ROMs automatically in mass (see [patching docs](docs/rom-patching.md))
- 🎩 Parse ROMs with headers, and optionally remove them (see [header docs](docs/rom-headers.md))
- 🔮 Know what ROMs are missing for each console (see [DAT docs](docs/dats.md))

## How do I run `igir`?

Either download the latest version for your OS from the [releases page](https://github.com/emmercm/igir/releases/latest), or if you have <span style="vertical-align:middle;">[![Node.js](https://img.shields.io/node/v/igir?label=Node.js&logo=node.js&logoColor=white)](https://nodejs.org/en/download/)</span> installed you can use [`npx`](https://docs.npmjs.com/cli/v8/commands/npx) to always run the latest version from the command line:

```shell
npx igir@latest [commands..] [options]
```

Here is the full help message which shows all available options and a number of common use case examples:

```help
$ igir --help

 ______   ______   ______  _______
|      \ /      \ |      \|       \
 \$$$$$$|  $$$$$$\ \$$$$$$| $$$$$$$\
  | $$  | $$ __\$$  | $$  | $$__| $$
  | $$  | $$|    \  | $$  | $$    $$   ROM collection manager
  | $$  | $$ \$$$$  | $$  | $$$$$$$\
 _| $$_ | $$__| $$ _| $$_ | $$  | $$   v1.0.0
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [commands..] [options]

Commands:
  igir copy     Copy ROM files from the input to output directory
  igir move     Move ROM files from the input to output directory
  igir extract  Extract ROM files in archives when copying or moving
  igir zip      Create zip archives of ROMs when copying or moving
  igir test     Test ROMs for accuracy after writing them to the output directory
  igir clean    Recycle unknown files in the output directory
  igir report   Generate a CSV report on the known ROM files found in the input directories (requ
                ires --dat)

Path options (inputs support globbing):
  -d, --dat            Path(s) to DAT files or archives                                   [array]
  -i, --input          Path(s) to ROM files or archives                        [array] [required]
  -I, --input-exclude  Path(s) to ROM files or archives to exclude                        [array]
  -p, --patch          Path(s) to ROM patch files or archives (supported: .bps, .ips, .ips32, .pp
                       f, .rup, .ups, .vcdiff, .xdelta)                                   [array]
  -o, --output         Path to the ROM output directory (supports replaceable symbols, see below)
                                                                                         [string]

Input options:
      --header  Glob pattern of files to force header processing for                     [string]

Output options:
      --dir-mirror      Use the input subdirectory structure for the output directory   [boolean]
  -D, --dir-dat-name    Use the DAT name as the output subdirectory                     [boolean]
      --dir-letter      Append the first letter of the ROM name as an output subdirectory
                                                                                        [boolean]
  -Z, --zip-exclude     Glob pattern of files to exclude from zipping                    [string]
  -H, --remove-headers  Remove known headers from ROMs, optionally limited to a list of comma-sep
                        arated file extensions (supported: .a78, .fds, .lnx, .nes, .smc) [string]
  -O, --overwrite       Overwrite any ROMs in the output directory                      [boolean]
  -C, --clean-exclude   Path(s) to files to exclude from cleaning                         [array]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to (supported: DA, DE, EL, EN
                         , ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)               [string]
  -R, --region-filter    List of comma-separated regions to limit to (supported: ARG, ASI, AUS, B
                         RA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA, JPN, KOR, MEX,
                          NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA, WORLD)         [string]
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
                               TA, JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA,
                                WORLD)                                                   [string]
      --prefer-revision-newer  Prefer newer ROM revisions over older                    [boolean]
      --prefer-revision-older  Prefer older ROM revisions over newer                    [boolean]
      --prefer-retail          Prefer retail releases (see --only-retail)               [boolean]
      --prefer-parent          Prefer parent ROMs over clones (requires parent-clone DAT files)
                                                                                        [boolean]

Help options:
  -v, --verbose  Enable verbose logging, can specify up to three times (-vvv)             [count]
  -h, --help     Show help                                                              [boolean]

-------------------------------------------------------------------------------------------------

Advanced usage:

  Tokens that are replaced when determining the output (--output) path of a ROM:
    {datName}             The name of the DAT that contains the ROM (e.g. "Nintendo - Game Boy")
    {datReleaseRegion}    The region of the ROM release (e.g. "USA"), each ROM can have multiple
    {datReleaseLanguage}  The language of the ROM release (e.g. "En"), each ROM can have multiple

    {inputDirname}    The input ROM's dirname
    {outputBasename}  Equivalent to "{outputName}.{outputExt}"
    {outputName}      The output ROM's filename without extension
    {outputExt}       The output ROM's extension

    {pocket}  The ROM's core-specific /Assets/* folder for the Analogue Pocket (e.g. "gb")
    {mister}  The ROM's core-specific /games/* folder for the MiSTer FPGA (e.g. "Gameboy")

Example use cases:

  Merge new ROMs into an existing ROM collection and generate a report:
    igir copy report --dat *.dat --input **/*.zip --input ROMs/ --output ROMs/

  Organize and zip an existing ROM collection:
    igir move zip --dat *.dat --input ROMs/ --output ROMs/

  Produce a 1G1R set per console, preferring English ROMs from USA>WORLD>EUR>JPN:
    igir copy --dat *.dat --input **/*.zip --output 1G1R/ --dir-dat-name --single --prefer-langua
    ge EN --prefer-region USA,WORLD,EUR,JPN

  Copy all BIOS files into one directory, extracting if necessary:
    igir copy extract --dat *.dat --input **/*.zip --output BIOS/ --only-bios

  Create patched copies of ROMs in an existing collection, not overwriting existing files:
    igir copy extract --input ROMs/ --patch Patches/ --output ROMs/

  Copy ROMs to your Analogue Pocket and test they were written correctly:
    igir copy extract test --dat *.dat --input ROMs/ --output /Assets/{pocket}/common/ --dir-lett
    er
```

See the [advanced examples](docs/advanced-examples.md) page for even more examples.

## Additional documentation

See the [docs](/docs) page for in-depth information on multiple topics!

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
- No ROM header detection & removal support
- No ROM patching functionality
- Limited parent/clone, region, language, version, and ROM type filtering
- No ability to prioritize parent/clones when creating a 1G1R set

## Feature requests, bug reports, and contributing

Feedback is a gift! Your feature requests and bug reports help improve the project for everyone. Feel free to submit an issue on GitHub using one of the templates.

Even better, if you feel comfortable writing code, please feel free to submit a pull request against the project!

<p align="center">

[![GitHub: contributors](https://img.shields.io/github/contributors/emmercm/igir?logo=github&logoColor=white)](https://github.com/emmercm/igir/graphs/contributors)
[![GitHub: discussions](https://img.shields.io/github/discussions/emmercm/igir?logo=github&logoColor=white)](https://github.com/emmercm/igir/discussions)
[![GitHub: feature requests](https://img.shields.io/github/issues/emmercm/igir/enhancement?color=%234BBCBC&label=feature%20requests&logo=github&logoColor=white)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement)
[![GitHub: bugs](https://img.shields.io/github/issues/emmercm/igir/bug?color=%23d73a4a&label=bugs&logo=github&logoColor=white)](https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Abug)

</p>
