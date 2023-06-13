# Personal Usage

`igir` has many options available to fit almost any use case, but the number of options can be overwhelming. So that begs a question: _how do I, the author of `igir`, use `igir` in the real world?_

## Primary ROM library

I have a 4TiB external hard drive that I use as my source of truth where I store all of my DATs, ROMs, and patches. In general, I'm more interested in cartridge-based consoles. Optical-based ROMs can take up a significant amount of space.

The file tree in that hard drive looks like this:

```text
/Volumes/WDPassport4
├── FBNeo
│   ├── Arcade
│   └── Neogeo
├── No-Intro
│   ├── Nintendo - Game Boy
│   ├── Nintendo - Game Boy Advance
│   ├── Nintendo - Game Boy Advance (Multiboot)
│   ├── Nintendo - Game Boy Advance (Video)
│   ├── Nintendo - Game Boy Advance (e-Reader)
│   ├── Nintendo - Game Boy Color
│   └── etc...
├── No-Intro Love Pack (PC XML) (2023-01-29).zip
├── Patches
│   ├── gb
│   ├── gba
│   ├── gbc
│   ├── genesis
│   └── snes
├── Redump
│   ├── Microsoft - Xbox - BIOS Images
│   ├── Nintendo - GameCube
│   ├── Sony - PlayStation - BIOS Images
│   └── Sony - PlayStation 2 - BIOS Images
├── Redump (2023-01-29).zip
├── TOSEC - DAT Pack - Complete (3530) (TOSEC-v2022-07-10).zip
└── igir_library_sync.sh
```

The root directory has a DAT zip and subdirectory for each [DAT](../dats.md) release group. This helps separate differing quality of DATs and different DAT group ROM naming schemes. I then have one subdirectory for each game console, using the `--dir-dat-name` option.

The `igir_library_sync.sh` script helps me keep this collection organized and merge new ROMs into it. The complete source is:

```bash
#!/usr/bin/env bash
# @param {...string} $@ Input directories to merge into this collection
set -euo pipefail

# Treat every CLI argument as an input directory
INPUTS=()
for INPUT in "$@"; do
  INPUTS+=(--input "${INPUT}")
done

npx --yes igir@latest move zip test clean report \
  --dat "./No-Intro*.zip" \
  --input "./No-Intro/" \
  "${INPUTS[@]}" \
  --patch "./Patches/" \
  --output "./No-Intro/" \
  --dir-dat-name

npx --yes igir@latest move extract test report \
  --dat "./Redump*.zip" \
  --input "./Redump/" \
  "${INPUTS[@]}" \
  --output "./Redump/" \
  --dir-dat-name
```

I then copy ROMs to other devices from this source of truth.

## Analogue Pocket

I have this script `igir_pocket_sync.sh` at the root of my [Analogue Pocket](https://www.analogue.co/pocket)'s SD card:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE=/Volumes/WDPassport4

npx igir@latest copy extract test clean \
  --dat "${SOURCE}/No-Intro*.zip" \
  --input "${SOURCE}/No-Intro/" \
  --input-exclude "${SOURCE}/No-Intro/Nintendo - Game Boy Advance (e-Reader)/" \
  --patch "${SOURCE}/Patches/" \
  --output "./Assets/{pocket}/common/" \
  --dir-letter \
  `# Leave BIOS files alone` \
  --clean-exclude "./Assets/*/common/*.*" \
  --no-bios \
  --no-bad \
  --single \
  --prefer-language EN \
  --prefer-region USA,WORLD,EUR,JPN \
  --prefer-revision-newer \
  --prefer-retail
```

That lets me create an EN+USA preferred 1G1R set for my Pocket on the fly, making sure I don't delete BIOS files needed for each core.

## GameCube

I have this script `sd2sp2_pocket_sync.sh` at the root of my GameCube [SD2SP2](https://github.com/citrus3000psi/SD2SP2) SD card:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE=/Volumes/WDPassport4

npx --yes igir@latest copy extract test clean \
  --input "${SOURCE}/Redump/Nintendo - GameCube" \
  --output "./ISOs/" \
  --dir-letter \
  --no-bios \
  --only-retail \
  --filter-regex-exclude "/(Baseball|Cabela|F1|FIFA|Football|Golf|Madden|MLB|NASCAR|NBA|NCAA|NFL|NHL|PGA|Soccer|Tennis|UFC|WWE)/i" \
  --writer-threads 1
```

It doesn't use DATs because I have the ISOs in a trimmed NKit format (see [Swiss](https://github.com/emukidid/swiss-gc)), so they won't match the checksums in DATs. I also exclude some games due to limited SD card size.

!!! note

    This uses the `--writer-threads` debug option because Swiss is sensitive to files being fragmented on the SD card ([swiss-gc#763](https://github.com/emukidid/swiss-gc/issues/763), [swiss-gc#122](https://github.com/emukidid/swiss-gc/issues/122), etc.). From experience, if you write too many files to an SD card at once, you may get an ambiguous error message mentioning fragmentation when loading an ISO.
