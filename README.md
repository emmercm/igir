# igir

A ROM collection manager to help sort collections and make one game, one rom (1G1R) sets.

![CLI:Windows,macOS,Linux](https://badgen.net/badge/icon/Windows,%20macOS,%20Linux?icon=terminal&label=CLI&color=blue)
[![npm:igir](https://badgen.net/npm/v/igir?color=red)](https://www.npmjs.com/package/igir)
[![GitHub:emmercm/igir](https://badgen.net/badge/emmercm/igir/purple?icon=github)](https://github.com/emmercm/igir)

[![Known Vulnerabilities](https://badgen.net/snyk/emmercm/igir?icon=snyk)](https://snyk.io/test/npm/igir)
[![Test Coverage](https://badgen.net/codecov/c/github/emmercm/igir/main?icon=codecov)](https://codecov.io/gh/emmercm/igir)
[![Maintainability Score](https://badgen.net/codeclimate/maintainability/emmercm/igir?icon=codeclimate)](https://codeclimate.com/github/emmercm/igir/maintainability)

## Summary

[![asciicast](https://asciinema.org/a/u1jeLTaSanO3mGzBb5b1jgxCy.svg)](https://asciinema.org/a/u1jeLTaSanO3mGzBb5b1jgxCy)

`igir` needs two inputs:

- One or more folders with **ROMs**, including ones in archives (.001, .7z, .bz2, .gz, .rar, .tar, .xz, .z, .z01, .zip, .zipx)
- A folder with ROM **DAT catalogs** (see below for more information)

And then it will execute one or more commands:

- `copy`: copy ROMs from input directories to an output directory
- `move`: copy ROMs from input directories to an output directory
- `zip`: create zip archives of output ROMs
- `clean`: recycle all unknown files in an output directory
- `test`: test all written ROMs for accuracy
- `report`: generate a report on ROMs in an input directory

## Installation

With [![Node.js](https://badgen.net/npm/node/igir?icon=nodejs)](https://nodejs.org/en/download/) installed:

```shell
npx igir@latest [commands..] [options]
```

## Usage

Here is the `igir --help` message which shows all available options and a number of common use case examples:

```help

```

## Obtaining DAT catalogs

XML-style DAT files that catalog every known ROM per system are required for `igir` to work effectively. A number of different release groups maintain these catalogs, the most popular are:

- [No-Intro](https://datomatic.no-intro.org/index.php?page=download&s=64) (cartridge-based systems)
- [Redump](http://redump.org/downloads/) (optical media-based systems)
- [ADVANsCEne](https://www.advanscene.com/html/dats.php) (GBA, DS, 3DS, PSP)
- [TOSEC](https://www.tosecdev.org/downloads/category/22-datfiles)

These catalogs help `igir` distinguish known ROM files in input directories from other files and helps generate reports on ROM collections.

## Obtaining ROMs

Emulators are generally legal, as long as they don't include copyrighted software such as a system BIOS.

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

There a few different popular ROM managers that have similar features:

- [clrmamepro](https://mamedev.emulab.it/clrmamepro/)
- [Romcenter](http://www.romcenter.com/)
- [Romulus Rom Manager](https://romulus.cc/)

Each manager has its own pros, but most share the same cons:

- Windows-only (sometimes with Wine support), making management on macOS and Linux difficult 
- Limited CLI support, making batching and repeatable actions difficult
- UIs that don't clearly state what actions can, will, or are being performed
- Required proprietary database setup step
- Limited or nonexistent archive extraction support
- Limited or nonexistent parent/clone, region, language, version, and ROM type filtering
- Limited or nonexistent priorities when creating a 1G1R set
- Limited or nonexistent folder management options
- Limited or nonexistent report-only modes
