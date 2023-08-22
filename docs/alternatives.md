# Alternative Managers

There are a few different popular ROM managers that have similar features:

| Feature                                 | [igir](index.md)                                              | [clrmamepro](https://mamedev.emulab.it/clrmamepro/)           | [RomVault](https://www.romvault.com/)                       | [Romcenter](http://www.romcenter.com/)     |
|-----------------------------------------|---------------------------------------------------------------|---------------------------------------------------------------|-------------------------------------------------------------|--------------------------------------------|
| Code: still in development              | ✅                                                             | ✅                                                             | ✅                                                           | ❓                                          |
| Code: open source                       | ✅ GPL                                                         | ❌                                                             | ❌                                                           | ❌                                          |
| App: OS compatibility                   | ✅ anything [Node.js supports](https://nodejs.org/en/download) | ⚠️ Windows, macOS & Linux via [Wine](https://www.winehq.org/) | ⚠️ Windows, Linux via [Mono](https://www.mono-project.com/) | ❌ Windows only                             |
| App: UI or CLI                          | CLI only by design                                            | UI only                                                       | Separate UI & CLI versions                                  | UI only                                    |
| App: required setup steps               | ✅ no setup required                                           | ❌ requires "profile" setup per DAT                            | ⚠️ if specifying DAT & ROM dirs                             | ❌ requires per-DAT DB setup                |
| DATs: supported formats                 | ✅ Logiqx XML, CMPro, HTGD SMDB ([DATs docs](input/dats.md))   | ⚠️ Logiqx XML, CMPro                                          | ✅ Logiqx XML, CMPro, HTGD SMDB                              | ✅ Logiqx XML, CMPro                        |
| DATs: process multiple at once          | ✅                                                             | ⚠️ via the batcher                                            | ✅                                                           | ❌                                          |
| DATs: built-in download manager         | ❌                                                             | ❌                                                             | ⚠️ via [DatVault](https://www.datvault.com/)                | ❌                                          |
| DATs: supports DAT URLs                 | ✅                                                             | ❌                                                             | ❌                                                           | ❌                                          |
| DATs: create from files (dir2dat)       | ❌                                                             | ✅                                                             | ✅                                                           | ❌                                          |
| DATs: combine multiple                  | ❌                                                             | ❌                                                             | ✅                                                           | ❌                                          |
| Archives: extraction formats            | ✅ many formats ([archive docs](input/reading-archives.md))            | ✅ `.zip`, `.7z`, `.rar`                                       | ⚠️ `.zip`, `.7z`                                            | ⚠️ `.zip`, `.7z`                           |
| Archives: creation formats              | ❌ `.zip` only by design                                       | ✅ `.zip`, `.7z`, `.rar`                                       | ⚠️ `.zip`, `.7z`                                            | ⚠️ `.zip`, `.7z`                           |
| ROMs: CHD scanning                      | ❌                                                             | ⚠️ via chdman                                                 | ✅ v1-5 natively                                             | ⚠️ v1-4 natively                           |
| ROMs: scan/checksum caching             | ❌ by design                                                   | ❌                                                             | ✅                                                           | ✅                                          |
| ROMs: header parsing                    | ✅                                                             | ✅                                                             | ✅                                                           | ✅ via plugins                              |
| ROMs: header removal                    | ✅                                                             | ❌                                                             | ❌                                                           | ❌                                          |
| ROMs: patching support                  | ✅ [patching docs](roms/patching.md)                            | ❌                                                             | ⚠️ SNES SuperDAT                                            | ❌                                          |
| Filtering: region, language, type, etc. | ✅ many options                                                | ❌ only 1G1R options                                           | ❌                                                           | ⚠️ only at DB setup                        |
| Filtering: 1G1R support                 | ✅ many options                                                | ⚠️ region & language only                                     | ❌                                                           | ⚠️ only at DB setup                        |
| Reports: report-only mode               | ✅                                                             | ✅                                                             | ✅                                                           | ✅                                          |
| Reports: easily parseable               | ✅ CSV                                                         | ⚠️ newline-separated "have" & "miss" lists                    | ⚠️ newline-separated "full" & "fix" reports                 | ⚠️ newline-separated "have" & "miss" lists |
| Output: separate input & output dirs    | ✅                                                             | ❌                                                             | ⚠️ yes but files are always moved                           | ❌                                          |
| Output: subdirectory customization      | ✅                                                             | ❌                                                             | ⚠️ depends on DAT organization                              | ❌                                          |
| Output: create single archive for DAT   | ✅                                                             | ❌                                                             | ✅                                                           | ❌                                          |
| Output: fixdat creation                 | ✅ [DATs docs](input/dats.md)                                  | ✅                                                             | ✅                                                           | ❌                                          |

!!! note

    Just like `igir`, other ROM managers that are in active development are likely to release new features often. The above table is not guaranteed to be perfectly up-to-date, it is just a best effort.

Other alternative ROM managers can be found in a number of other wikis, such as:

- [Emulation General Wiki](https://emulation.gametechwiki.com/index.php/ROM_managers)
- [Pleasuredome's "Retro Arcade Guides"](https://pleasuredome.miraheze.org/wiki/ROM_Manager)
- [Recalbox](https://wiki.recalbox.com/en/tutorials/utilities/rom-management)
- [RetroPie](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/)
