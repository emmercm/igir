<h1 align="center">🕹️ igir</h1>

<p align="center"><b>Pronounced "eager," <code>igir</code> is a video game ROM collection manager to help filter, sort, patch, archive, and report on collections on any OS.</b></p>

<p align="center">
  <a href="https://igir.io/"><img alt="CLI: Windows,macOS,Linux" src="https://img.shields.io/badge/CLI-Windows%2C%20macOS%2C%20Linux-lightgrey?logo=windows-terminal"></a>
  <a href="https://www.npmjs.com/package/igir"><img alt="npm: version" src="https://img.shields.io/npm/v/igir?color=%23cc3534&label=version&logo=npm&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/igir"><img alt="npm: downloads" src="https://img.shields.io/npm/dt/igir?color=%23cc3534&logo=npm&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir/releases"><img alt="GitHub: downloads" src="https://img.shields.io/github/downloads/emmercm/igir/total?color=%236e5494&logo=github&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir"><img alt="GitHub: stars" src="https://img.shields.io/github/stars/emmercm/igir?color=%236e5494&logo=github&logoColor=white"></a>
</p>
<p align="center">
  <a href="https://snyk.io/test/npm/igir"><img alt="Snyk: vulnerabilities" src="https://snyk.io/test/npm/igir/badge.svg"></a>
  <a href="https://codecov.io/gh/emmercm/igir"><img alt="codecov: coverage" src="https://img.shields.io/codecov/c/github/emmercm/igir?logo=codecov&logoColor=white"></a>
  <a href="https://codeclimate.com/github/emmercm/igir/maintainability"><img alt="Code Climate: maintainability" src="https://img.shields.io/codeclimate/maintainability-percentage/emmercm/igir?logo=codeclimate&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/emmercm/igir?color=blue"></a>
</p>

<p align="center"><i>See the <a href="https://igir.io/">project website</a> for complete documentation, installation & usage instructions, and examples!</i></p>

<br>

## What does `igir` do?

A video of an example use case:

[![asciicast](https://asciinema.org/a/Sum1WBdZRsSTvbZvVuP5Ho1N9.svg)](https://asciinema.org/a/Sum1WBdZRsSTvbZvVuP5Ho1N9)

With `igir` you can manage a ROM collection of any size:

- 🔍 Scan for DATs, ROMs, and ROM patches - including those in archives (see [scanning](https://igir.io/input/file-scanning) & [archive docs](https://igir.io/input/reading-archives))
- 📂 Organize ROM files by console (see [DAT docs](https://igir.io/input/dats))
- 🪄 Name ROM files consistently, including the right extension (see [DAT docs](https://igir.io/input/dats))
- ✂️ Filter out duplicate ROMs, or ROMs in languages you don't understand (see [filtering docs](https://igir.io/roms/filtering-preferences))
- 🗜️ Extract or archive ROMs in mass (see [archive docs](https://igir.io/output/writing-archives))
- 🩹 Patch ROMs automatically in mass (see [scanning](https://igir.io/input/file-scanning) & [patching docs](https://igir.io/roms/patching))
- 🎩 Parse ROMs with headers, and optionally remove them (see [header docs](https://igir.io/roms/headers))
- ↔️ Build & re-build (un-merge, split, or merge) MAME ROM sets (see [arcade docs](https://igir.io/output/arcade))
- 🔮 Report on what ROMs are present or missing for each console, and create fixdats for missing ROMs (see [reporting](https://igir.io/output/reporting) & [DAT docs](https://igir.io/input/dats))

## How do I run `igir`?

Either download the latest version for your OS from the [releases page](https://github.com/emmercm/igir/releases/latest), or if you have Node.js installed you can use [`npx`](https://docs.npmjs.com/cli/v9/commands/npx) to always run the latest version from the command line:

```shell
npx igir@latest [commands..] [options]
```

Here is the full help message which shows all available options and a number of common use case examples:

```help
$ igir --help

 ______   ______   ______  _______
|      \ /      \ |      \|       \
 \$$$$$$|  $$$$$$\ \$$$$$$| $$$$$$$\
  | $$  | $$|    \  | $$  | $$    $$   ROM collection manager
  | $$  | $$|    \  | $$  | $$    $$   https://igir.io/
  | $$  | $$ \$$$$  | $$  | $$$$$$$\
 _| $$_ | $$__| $$ _| $$_ | $$  | $$   v2.0.5
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [commands..] [options]

Commands (can specify multiple):
  igir copy     Copy ROM files from the input to output directory
  igir move     Move ROM files from the input to output directory
  igir symlink  Create symlinks in the output directory to ROM files in the input directory
  igir extract  Extract ROM files in archives when copying or moving
  igir zip      Create zip archives of ROMs when copying or moving
  igir test     Test ROMs for accuracy after writing them to the output directory
  igir fixdat   Generate a fixdat of any missing games for every DAT processed (requires --dat)
  igir clean    Recycle unknown files in the output directory
  igir report   Generate a CSV report on the known & unknown ROM files found in the input directo
                ries (requires --dat)

Input options (supports globbing):
  -i, --input          Path(s) to ROM files or archives                        [array] [required]
  -I, --input-exclude  Path(s) to ROM files or archives to exclude from processing        [array]
  -p, --patch          Path(s) to ROM patch files or archives (supported: .aps, .bps, .dps, .ebp,
                        .ips, .ips32, .ppf, .rup, .ups, .vcdiff, .xdelta)                 [array]
  -P, --patch-exclude  Path(s) to ROM patch files or archives to exclude from processing  [array]

DAT input options:
  -d, --dat                            Path(s) to DAT files or archives (supports globbing)
                                                                                          [array]
      --dat-exclude                    Path(s) to DAT files or archives to exclude from processin
                                       g (supports globbing)                              [array]
      --dat-name-regex                 Regular expression of DAT names to process        [string]
      --dat-name-regex-exclude         Regular expression of DAT names to exclude from processing
                                                                                         [string]
      --dat-description-regex          Regular expression of DAT descriptions to process [string]
      --dat-description-regex-exclude  Regular expression of DAT descriptions to exclude from pro
                                       cessing                                           [string]

ROM output options (processed in order):
  -o, --output               Path to the ROM output directory (supports replaceable symbols, see
                             below)                                                      [string]
      --dir-mirror           Use the input subdirectory structure for the output directory
                                                                                        [boolean]
  -D, --dir-dat-name         Use the DAT name as the output subdirectory                [boolean]
      --dir-dat-description  Use the DAT description as the output subdirectory         [boolean]
      --dir-letter           Append the first letter of the ROM name as an output subdirectory
                                                                                        [boolean]
      --dir-letter-limit     Limit the number ROMs in letter subdirectories, splitting into multi
                             ple if necessary                                            [number]
      --dir-game-subdir      Append the name of the game as an output directory depending on its
                             ROMs  [choices: "never", "multiple", "always"] [default: "multiple"]
  -O, --overwrite            Overwrite any files in the output directory                [boolean]
      --overwrite-invalid    Overwrite files in the output directory that are the wrong filesize,
                              checksum, or zip contents                                 [boolean]
  -C, --clean-exclude        Path(s) to files to exclude from cleaning (supports globbing)[array]

ROM zip command options:
  -Z, --zip-exclude   Glob pattern of files to exclude from zipping                      [string]
      --zip-dat-name  Group all ROMs from the same DAT into the same zip archive, if not excluded
                       from zipping (enforces --dat-threads 1)                          [boolean]

ROM symlink command options:
      --symlink-relative  Create symlinks as relative to the target path, as opposed to absolute
                                                                                        [boolean]

ROM header options:
      --header          Glob pattern of files to force header processing for             [string]
  -H, --remove-headers  Remove known headers from ROMs, optionally limited to a list of comma-sep
                        arated file extensions (supported: .a78, .fds, .lnx, .nes, .smc) [string]

ROM set options:
      --merge-roms             ROM merge/split mode (requires DATs with parent/clone information)
            [choices: "fullnonmerged", "nonmerged", "split", "merged"] [default: "fullnonmerged"]
      --allow-incomplete-sets  Allow writing games that don't have all of their ROMs    [boolean]

ROM filtering options:
  -x, --filter-regex          Regular expression of game names to filter to              [string]
  -X, --filter-regex-exclude  Regular expression of game names to exclude                [string]
  -L, --filter-language       List of comma-separated languages to filter to (supported: DA, DE,
                              EL, EN, ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)    [string]
  -R, --filter-region         List of comma-separated regions to filter to (supported: ARG, ASI,
                              AUS, BEL, BRA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, HOL, ITA
                              , JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK, USA, WO
                              RLD)                                                       [string]
      --no-bios               Filter out BIOS files, opposite of --only-bios            [boolean]
      --no-device             Filter out MAME devies, opposite of --only-device         [boolean]
      --no-unlicensed         Filter out unlicensed ROMs, opposite of --only-unlicensed [boolean]
      --only-retail           Filter to only retail releases, enabling all the following "no" opt
                              ions                                                      [boolean]
      --no-debug              Filter out debug ROMs, opposite of --only-debug           [boolean]
      --no-demo               Filter out demo ROMs, opposite of --only-demo             [boolean]
      --no-beta               Filter out beta ROMs, opposite of --only-beta             [boolean]
      --no-sample             Filter out sample ROMs, opposite of --only-sample         [boolean]
      --no-prototype          Filter out prototype ROMs, opposite of --only-prototype   [boolean]
      --no-test-roms          Filter out test ROMs, opposite of --only-test-roms        [boolean]
      --no-aftermarket        Filter out aftermarket ROMs, opposite of --only-aftermarket
                                                                                        [boolean]
      --no-homebrew           Filter out homebrew ROMs, opposite of --only-homebrew     [boolean]
      --no-unverified         Filter out unverified ROMs, opposite of --only-unverified [boolean]
      --no-bad                Filter out bad ROM dumps, opposite of --only-bad          [boolean]

One game, one ROM (1G1R) options:
  -s, --single                 Output only a single game per parent (1G1R) (required for all opti
                               ons below, requires DATs with parent/clone information)  [boolean]
      --prefer-verified        Prefer verified ROM dumps over unverified                [boolean]
      --prefer-good            Prefer good ROM dumps over bad                           [boolean]
  -l, --prefer-language        List of comma-separated languages in priority order (supported: DA
                               , DE, EL, EN, ES, FI, FR, IT, JA, KO, NL, NO, PT, RU, SV, ZH)
                                                                                         [string]
  -r, --prefer-region          List of comma-separated regions in priority order (supported: ARG,
                                ASI, AUS, BEL, BRA, CAN, CHN, DAN, EUR, FRA, FYN, GER, GRE, HK, H
                               OL, ITA, JPN, KOR, MEX, NOR, NZ, POR, RUS, SPA, SWE, TAI, UK, UNK,
                                USA, WORLD)                                              [string]
      --prefer-revision-newer  Prefer newer ROM revisions over older                    [boolean]
      --prefer-revision-older  Prefer older ROM revisions over newer                    [boolean]
      --prefer-retail          Prefer retail releases (see --only-retail)               [boolean]
      --prefer-ntsc            Prefer NTSC ROMs over others                             [boolean]
      --prefer-pal             Prefer PAL ROMs over others                              [boolean]
      --prefer-parent          Prefer parent ROMs over clones                           [boolean]

Report options:
      --report-output  Report output location (formatted with moment.js)
                                       [string] [default: "./igir_%YYYY-%MM-%DDT%HH:%mm:%ss.csv"]

Help & debug options:
      --dat-threads     Number of DATs to process in parallel               [number] [default: 3]
      --writer-threads  Maximum number of ROMs to write in parallel        [number] [default: 20]
  -v, --verbose         Enable verbose logging, can specify up to three times (-vvv)      [count]
  -h, --help            Show help                                                       [boolean]

-------------------------------------------------------------------------------------------------

Advanced usage:

  Tokens that are replaced when generating the output (--output) path of a ROM:
    {datName}         The name of the DAT that contains the ROM (e.g. "Nintendo - Game Boy")
    {datDescription}  The description of the DAT that contains the ROM
    {gameRegion}      The region of the ROM release (e.g. "USA"), each ROM can have multiple
    {gameLanguage}    The language of the ROM release (e.g. "En"), each ROM can have multiple
    {gameType}        The type of the game (e.g. "Retail", "Demo", "Prototype")

    {inputDirname}    The input file's dirname
    {outputBasename}  Equivalent to "{outputName}.{outputExt}"
    {outputName}      The output file's filename without extension
    {outputExt}       The output file's extension

    {pocket}    The ROM's core-specific /Assets/* directory for the Analogue Pocket (e.g. "gb")
    {mister}    The ROM's core-specific /games/* directory for the MiSTer FPGA (e.g. "Gameboy")
    {onion}     The ROM's emulator-specific /Roms/* directory for OnionOS/GarlicOS (e.g. "GB")
    {batocera}  The ROM's emulator-specific /roms/* directory for Batocera (e.g. "gb")
    {jelos}     The ROM's emulator-specific /roms/* directory for JELOS (e.g. "gb")

Example use cases:

  Merge new ROMs into an existing ROM collection and generate a report:
    igir copy report --dat *.dat --input **/*.zip --input ROMs/ --output ROMs/

  Generate a report on an existing ROM collection, without copying or moving ROMs (read only):
    igir report --dat *.dat --input ROMs/

  Organize and zip an existing ROM collection:
    igir move zip --dat *.dat --input ROMs/ --output ROMs/

  Produce a 1G1R set per console, preferring English ROMs from USA>WORLD>EUR>JPN:
    igir copy --dat *.dat --input **/*.zip --output 1G1R/ --dir-dat-name --single --prefer-langua
    ge EN --prefer-region USA,WORLD,EUR,JPN

  Copy all Mario, Metroid, and Zelda games to one directory:
    igir copy --input ROMs/ --output Nintendo/ --filter-regex "/(Mario|Metroid|Zelda)/i"

  Copy all BIOS files into one directory, extracting if necessary:
    igir copy extract --dat *.dat --input **/*.zip --output BIOS/ --only-bios

  Create patched copies of ROMs in an existing collection, not overwriting existing files:
    igir copy extract --input ROMs/ --patch Patches/ --output ROMs/

  Re-build a MAME ROM set for a specific version of MAME:
    igir copy zip --dat "MAME 0.258.dat" --input MAME/ --output MAME-0.258/ --merge-roms split

  Copy ROMs to an Analogue Pocket and test they were written correctly:
    igir copy extract test --dat *.dat --input ROMs/ --output /Assets/{pocket}/common/ --dir-lett
    er
```

## Feature requests, bug reports, and contributing

Feedback is a gift! Your feature requests and bug reports help improve the project for everyone. Feel free to [submit an issue](https://github.com/emmercm/igir/issues/new/choose) on GitHub using one of the templates.

Even better, if you feel comfortable writing code, please feel free to submit a pull request against the project! Please see the full [contribution guidelines](https://igir.io/contributing) for rules to follow.

<br>
<p align="center">
  <a href="https://github.com/emmercm/igir/graphs/contributors"><img alt="GitHub: contributors" src="https://img.shields.io/github/contributors/emmercm/igir?logo=github&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Abug"><img alt="GitHub: bugs" src="https://img.shields.io/github/issues/emmercm/igir/bug?color=%23d73a4a&label=bugs&logo=github&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement"><img alt="GitHub: feature requests" src="https://img.shields.io/github/issues/emmercm/igir/enhancement?color=%234BBCBC&label=feature%20requests&logo=github&logoColor=white"></a>
  <a href="https://github.com/emmercm/igir/discussions"><img alt="GitHub: discussions" src="https://img.shields.io/github/discussions/emmercm/igir?logo=github&logoColor=white"></a>
</p>
