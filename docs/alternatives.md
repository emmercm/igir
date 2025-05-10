# Alternative Managers

There are a few different popular ROM managers that have similar features:

| Feature                                    | [igir](index.md)                                                                                              | [RomVault](https://www.romvault.com/)                               | [clrmamepro](https://mamedev.emulab.it/clrmamepro/)           | [RomCenter](http://www.romcenter.com/)     |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------------------|--------------------------------------------|
| App: in active development                 | ✅                                                                                                             | ✅                                                                   | ✅                                                             | ❓                                          |
| App: OS compatibility                      | ✅ anything [Node.js supports](https://nodejs.org/en/download)                                                 | ⚠️ Windows, macOS & Linux via [Mono](https://www.mono-project.com/) | ⚠️ Windows, macOS & Linux via [Wine](https://www.winehq.org/) | ❌ Windows only                             |
| App: GUI or CLI                            | CLI only by design                                                                                            | Primarily GUI, with a separate CLI                                  | GUI only                                                      | GUI only                                   |
| App: required setup steps                  | ✅ no setup required                                                                                           | ⚠️ if specifying DAT & ROM dirs                                     | ❌ requires "profile" setup per DAT                            | ❌ requires per-DAT DB setup                |
| App: open source                           | ✅ GPL v3                                                                                                      | ❌                                                                   | ❌                                                             | ❌                                          |
| DATs: supported formats                    | Logiqx XML, MAME ListXML, MAME Software List, CMPro, HTGD SMDB ([DATs docs](dats/processing.md))              | Logiqx XML, MAME ListXML, CMPro, RomCenter, HTGD SMDB, Total DOS    | Logiqx XML, MAME ListXML, MAME Software List, CMPro           | Logiqx XML, CMPro, RomCenter               |
| DATs: process multiple at once             | ✅                                                                                                             | ✅                                                                   | ⚠️ via the batcher                                            | ❌                                          |
| DATs: infer parent/clone info              | ✅                                                                                                             | ❌                                                                   | ❌                                                             | ❌                                          |
| DATs: built-in download manager            | ❌                                                                                                             | ⚠️ via [DatVault](https://www.datvault.com/)                        | ❌                                                             | ❌                                          |
| DATs: supports URLs to DATs                | ✅                                                                                                             | ❌                                                                   | ❌                                                             | ❌                                          |
| DATs: create from files (dir2dat)          | ✅ [dir2dat docs](dats/dir2dat.md)                                                                             | ❓                                                                   | ✅                                                             | ❌                                          |
| DATs: fixdat creation                      | ✅ [fixdat docs](dats/fixdats.md)                                                                              | ✅                                                                   | ✅                                                             | ❌                                          |
| DATs: combine multiple                     | ✅                                                                                                             | ✅                                                                   | ❌                                                             | ❌                                          |
| ROM Scanning: parallel scanning            | ✅                                                                                                             | ❌                                                                   | ❓                                                             | ❓                                          |
| ROM Scanning: scanning exclusions          | ✅                                                                                                             | ❌                                                                   | ❓                                                             | ❓                                          |
| ROM Scanning: quick scanning               | ✅ [matching docs](roms/matching.md)                                                                           | ✅ (scanning level 1)                                                | ⚠️ by default                                                 | ❓                                          |
| ROM Scanning: scan/checksum caching        | ✅                                                                                                             | ✅                                                                   | ❌                                                             | ✅                                          |
| ROMs: checksum matching strategies         | ✅ CRC32+size, MD5, SHA1, SHA256                                                                               | ⚠️ CRC32+size, MD5, SHA1                                            | ⚠️ CRC32+size, MD5, SHA1                                      | ❓                                          |
| ROMs: header detection                     | ✅                                                                                                             | ✅                                                                   | ⚠️ via supplemental XMLs                                      | ⚠️ via plugins                             |
| ROMs: header removal                       | ✅ [automatic and forced](roms/headers.md)                                                                     | ⚠️ if configured                                                    | ❌                                                             | ❌                                          |
| ROMs: automatic extension correction       | ✅ [output writing docs](output/options.md#fixing-rom-extensions)                                              | ❌                                                                   | ❌                                                             | ❌                                          |
| ROMs: patching support                     | ✅ many formats ([patching docs](roms/patching.md))                                                            | ❌                                                                   | ❌                                                             | ❌                                          |
| Arcade: supported merge types              | ✅ full non-merged, non-merged, split, merged ([arcade docs](usage/arcade.md))                                 | ⚠️ full non-merged, split, merged                                   | ✅ full non-merged, non-merged, split, merged                  | ⚠️ full non-merged, split, merged          |
| Arcade: CHD disk inclusion                 | ✅ by default, can be turned off ([arcade docs](usage/arcade.md))                                              | ✅ by default, can be turned off                                     | ❓                                                             | ❓                                          |
| Arcade: sample inclusion                   | ❌                                                                                                             | ❌                                                                   | ✅                                                             | ❓                                          |
| Archives: common formats support           | ✅ `.zip` (incl. zstd), `.7z` (via `7za`), `.gz`, `.rar`, `.tar`, and more ([docs](input/reading-archives.md)) | ⚠️ `.zip` (incl. zstd), `.7z` (natively)                            | ⚠️ `.zip`, `.7z` (via `7z`), `.rar` (via `rar`)               | ⚠️ `.zip`, `.7z`                           |
| Archives: `.chd` support                   | ⚠️ via `chdman`<sup>1</sup> (bundled)                                                                         | ✅ v1-5 natively                                                     | ⚠️ via `chdman`<sup>1</sup>                                   | ⚠️ v1-4 natively                           |
| Archives: `.cso` & `.zso` support          | ⚠️ via `maxcso` (bundled)                                                                                     | ❌                                                                   | ❌                                                             | ❌                                          |
| Archives: `.gcz`, `.rvz`, & `.wia` support | ⚠️ via `dolphin-tool` (bundled)                                                                               | ❌                                                                   | ❌                                                             | ❌                                          |
| Archives: `.nkit.iso` support              | ⚠️ matching but no extraction/inflation ([GameCube docs](usage/console/gamecube.md#nkit))                     | ❌                                                                   | ❌                                                             | ❌                                          |
| Archives: creation formats                 | ❌ `.zip` (TorrentZip, RVZSTD) only by design ([writing archives docs](output/writing-archives.md))            | ✅ `.zip` (TorrentZip, RVZSTD, Total DOS), `.7z` (LZMA, zstd)        | ⚠️ `.zip` (TorrentZip), `.7z`, `.rar`                         | ⚠️ `.zip`, `.7z`                           |
| Archives: contents checksums               | ✅ when needed ([reading archives docs](input/reading-archives.md))                                            | ⚠️ requires "files only" mode or directory                          | ⚠️ if DAT has forcepacking=unzip                              | ❓                                          |
| Archives: automatic extension correction   | ✅                                                                                                             | ❌                                                                   | ❌                                                             | ❌                                          |
| Filtering: region, language, type, etc.    | ✅ [many options](roms/filtering-preferences.md#filters)                                                       | ❌                                                                   | ❌ only 1G1R options                                           | ⚠️ only at DB setup                        |
| Filtering: 1G1R support                    | ✅ [many options](roms/filtering-preferences.md#preferences-for-1g1r)                                          | ❌                                                                   | ⚠️ region & language only                                     | ⚠️ only at DB setup                        |
| Playlists: creation support                | ✅ [playlists docs](output/playlists.md)                                                                       | ❌                                                                   | ❌                                                             | ❌                                          |
| Reports: report-only mode                  | ✅                                                                                                             | ✅                                                                   | ✅                                                             | ✅                                          |
| Reports: machine parseable                 | ✅ CSV                                                                                                         | ⚠️ newline-separated "full" & "fix" reports                         | ⚠️ newline-separated "have" & "miss" lists                    | ⚠️ newline-separated "have" & "miss" lists |
| Output: file link support                  | ✅ hard & symbolic links                                                                                       | ❌                                                                   | ❌                                                             | ❌                                          |
| Output: separate input & output dirs       | ✅                                                                                                             | ⚠️ yes but files are always moved                                   | ❌                                                             | ❌                                          |
| Output: subdirectory customization         | ✅ [many options](output/path-options.md)                                                                      | ⚠️ depends on DAT organization                                      | ❌                                                             | ❌                                          |
| Output: create single archive for DAT      | ✅                                                                                                             | ✅                                                                   | ❌                                                             | ❌                                          |

<small>
<sup>1</sup> may require you to install SDL2 manually, see the [chdman-js README](https://github.com/emmercm/chdman-js#readme).
</small>

!!! note

    Just like Igir, other ROM managers that are in active development are likely to release new features often. The above table is not guaranteed to be perfectly up-to-date, it is just a best effort.

There are some other managers omitted from the table above because they focus more on visual presentation and in-browser/app emulation than they do organization:

- [RomM](https://romm.app/)
- [Retrom](https://github.com/JMBeresford/retrom)
- [Gaseous](https://github.com/gaseous-project/gaseous-server)

Lists of other ROM managers can be found in a number of other wikis, such as:

- [Emulation General Wiki](https://emulation.gametechwiki.com/index.php/ROM_managers)
- [Pleasuredome's "Retro Arcade Guides"](https://pleasuredome.miraheze.org/wiki/ROM_Manager)
- [Recalbox](https://wiki.recalbox.com/en/tutorials/utilities/rom-management)
- [RetroPie](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/)

## Migrating from RomVault

The majority of [RomVault's](https://www.romvault.com/) functionality also exists in Igir. Here is how users of RomVault can achieve the same default behavior in Igir.

Given a typical RomVault directory structure that looks something like:

```text
ROMVault_V3.7.4/
├── DatRoot
│   ├── No-Intro Love Pack (PC) (2025-05-09)
│   │   ├── No-Intro
│   │   │   ├── Sega - Game Gear (Parent-Clone) (20241203-185356).dat
│   │   │   ├── Sega - Master System - Mark III (Parent-Clone) (20241225-050512).dat
│   │   │   ├── Sega - Mega Drive - Genesis (Parent-Clone) (20250210-102212).dat
│   │   │   └── ...
│   │   └── Non-Redump
│   │       ├── Non-Redump - Nintendo - Nintendo GameCube (Parent-Clone) (20250118-063947).dat
│   │       ├── Non-Redump - Nintendo - Wii (Parent-Clone) (20241203-105832).dat
│   │       ├── Non-Redump - Nintendo - Wii U (Parent-Clone) (20231229-065143).dat
│   │       └── ...
│   └── Redump (2025-05-09)
│       ├── Sony - PlayStation - Datfile (10853) (2025-05-09 17-16-34).dat
│       ├── Sony - PlayStation 2 - Datfile (11623) (2025-05-09 15-01-56).dat
│       ├── Sony - PlayStation - Datfile (10853) (2025-05-09 17-16-34).dat
│       └── ...
├── RomRoot
│   ├── No-Intro Love Pack (PC) (2025-05-09)
│   │   ├── No-Intro
│   │   │   └── ...
│   │   └── Non-Redump
│   │       └── ...
│   └── Redump (2025-05-09)
│       └── ...
├── ROMVault37.exe
└── ToSort
    └── ...
```

here is how you can perform each RomVault action in Igir:

1. **Update DATs**

    The equivalent action in Igir is to scan for DATs using the [`--dat <path>` option](dats/processing.md#scanning-for-dats) when performing some [command](commands.md).

    Igir does not cache parsed DATs like RomVault does, which requires fewer setup actions, but at the expense of needing to parse DAT files during every run.

2. **Scan ROMs**

    The equivalent action in Igir is to scan for ROMs using the [`--input <path>` option](input/file-scanning.md) when performing some [command](commands.md). You will need to provide both the unsorted ("ToSort") and sorted ("RomRoot") directories as inputs.

    RomVault's default "level 2" scan level can be achieved with the [`--input-checksum-min SHA1` option](roms/matching.md#manually-using-other-checksum-algorithms) (not recommended).

3. **Find fixes**

    This is done when writing ROMs or generating some kind of report (below).

4. **Fix ROMs**

    The equivalent Igir action is to move missing ROMs from an input directory ([`--input <path>` option](input/file-scanning.md)) to the output directory ([`--output <path>` option](output/path-options.md)) using the [`igir move` command](commands.md#move).

    By default, RomVault writes TorrentZip archives, and it will overwrite files that are not in the TorrentZip structure. This can be achieved with a combination of the [`igir zip` command](output/writing-archives.md), the [`--zip-format torrentzip`](output/writing-archives.md#torrentzip) option (default), and the [`--overwrite-invalid` option](output/options.md#overwriting-files). Igir does not offer a way to create 7zip archives like RomVault does.

    RomVault respects the directory structure of DATs and "mirrors" it in the sorted directory ("RomRoot"). This can be achieved with a combination of the [`--dir-dat-mirror`](output/path-options.md#mirror-the-dat-subdirectory) and [`--dir-dat-name`](output/path-options.md#append-dat-name) options.

    During writing, RomVault will move unmatched files in the sorted directory ("RomRoot") to the unsorted directory ("ToSort"). This can be achieved with a combination of the [`igir clean` command](output/cleaning.md) and the [`--clean-backup <path>` option](output/cleaning.md#backing-up-cleaned-files).

5. **Generate reports**

    The equivalent Igir action is the [`igir report` command](output/reporting.md).

Tying it all together, the Igir command to achieve the same behavior as RomVault's defaults is:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move zip clean ^
      --input "ToSort\" ^
      --input "RomRoot\" ^
      --input-checksum-min SHA1 ^
      --dat "DatRoot\" ^
      --output "RomRoot\" ^
      --dir-dat-mirror ^
      --dir-dat-name ^
      --overwrite-invalid ^
      --clean-backup "ToSort\" ^
      --zip-format torrentzip ^
      --merge-roms fullnonmerged ^
      -v
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move zip clean \
      --input "ToSort/" \
      --input "RomRoot/" \
      --input-checksum-min SHA1 \
      --dat "DatRoot/" \
      --output "RomRoot/" \
      --dir-dat-mirror \
      --dir-dat-name \
      --overwrite-invalid \
      --clean-backup "ToSort/" \
      --zip-format torrentzip \
      --merge-roms fullnonmerged \
      -v
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move zip clean \
      --input "ToSort/" \
      --input "RomRoot/" \
      --input-checksum-min SHA1 \
      --dat "DatRoot/" \
      --output "RomRoot/" \
      --dir-dat-mirror \
      --dir-dat-name \
      --overwrite-invalid \
      --clean-backup "ToSort/" \
      --zip-format torrentzip \
      --merge-roms fullnonmerged \
      -v
    ```

!!! note

    Igir does not currently offer an alternative to RomVault's subscription-based [DATVault](https://www.datvault.com/) DAT downloader.
