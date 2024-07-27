# Creator's Usage

Igir has many options available to fit almost any use case, but the number of options can be overwhelming. So that begs a question: _how do I, the creator of Igir, use Igir in the real world?_

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

The root directory has a DAT zip and subdirectory for each [DAT](../dats/introduction.md) release group. This helps separate differing quality of DATs and different DAT group ROM naming schemes. I then have one subdirectory for each game console, using the [`--dir-dat-name` option](../output/path-options.md).

The `igir_library_sync.sh` script helps me keep this collection organized and merge new ROMs into it. The complete source is:

```bash
#!/usr/bin/env bash
# @param {...string} $@ Input directories to merge into this collection
set -euo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT
cd "$(dirname "$0")"


# Treat every CLI argument as an input directory
INPUTS=()
for INPUT in "$@"; do
  INPUTS+=(--input "${INPUT}")
done

npx --yes igir@latest move zip test clean report \
  --dat "./No-Intro*.zip" \
  --dat-name-regex-exclude "/encrypted/i" \
  --input "./No-Intro/" \
  "${INPUTS[@]}" \
  --patch "./Patches/" \
  --output "./No-Intro/" \
  --dir-dat-name \
  --overwrite-invalid

npx --yes igir@latest move zip test \
  --dat "./Redump*.zip" \
  --input "./Redump/" \
  "${INPUTS[@]}" \
  --output "./Redump/" \
  --dir-dat-name

npx --yes igir@latest move zip test clean \
  `# Official MAME XML extracted from the progetto-SNAPS archive` \
  --dat "./mame*.xml" \
  `# Rollback DAT downloaded from Pleasuredome` \
  --dat "./MAME*Rollback*.zip" \
  --input "./MAME/" \
  "${INPUTS[@]}" \
  --output "./MAME/" \
  --dir-dat-name \
  --overwrite-invalid \
  --merge-roms split
```

I then copy ROMs to other devices from this source of truth.

## Analogue Pocket

!!! note

    See the full [Analogue Pocket](hardware/analogue-pocket.md) page for more detailed information.

I have this script `igir_pocket_sync.sh` at the root of my Analogue Pocket's SD card:

```bash
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT
cd "$(dirname "$0")"


SOURCE=/Volumes/WDPassport4

npx igir@latest copy extract test clean \
  --dat "${SOURCE}/No-Intro*.zip" \
  --dat-name-regex-exclude "/headerless/i" \
  --input "${SOURCE}/No-Intro/" \
  --input-exclude "${SOURCE}/No-Intro/Nintendo - Game Boy Advance (e-Reader)/" \
  --patch "${SOURCE}/Patches/" \
  --output "./Assets/{pocket}/common/" \
  --dir-letter \
  --dir-letter-limit 1000 \
  `# Leave BIOS files alone` \
  --clean-exclude "./Assets/*/common/*.*" \
  --overwrite-invalid \
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

!!! note

    See the full [GameCube](console/gamecube.md) page for more detailed information.

I have this script `sd2sp2_pocket_sync.sh` at the root of my GameCube [SD2SP2](https://github.com/citrus3000psi/SD2SP2) SD card:

```bash
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT
cd "$(dirname "$0")"


SOURCE=/Volumes/WDPassport4

npx --yes igir@latest copy test clean report \
  --dat "${SOURCE}/Redump*.zip" \
  --dat-name-regex '/gamecube/i' \
  --input "${SOURCE}/Redump/Nintendo - GameCube" \
  --output "./Games/" \
  --dir-letter \
  --filter-regex-exclude "/(Baseball|Basketball|Cabela|Disney|F1|FIFA|Football|Golf|Madden|MLB|MLS|NASCAR|NBA|NCAA|NFL|NHL|Nickelodeon|PGA|Soccer|Tennis|UFC|WWE)/i" \
  --no-bios \
  --only-retail \
  --single \
  --prefer-language EN \
  --prefer-region USA,WORLD,EUR,JPN \
  --prefer-revision-newer \
  --overwrite-invalid \
  --writer-threads 1 \
  -v
```

I use the trimmed [NKit format](https://wiki.gbatemp.net/wiki/NKit) for ISOs, which Igir can't extract, so they're copied as-is. I also exclude some games due to limited SD card size.
