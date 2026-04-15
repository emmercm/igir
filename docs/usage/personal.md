# Real World Example

Igir has many options available to fit almost any use case, but the number of options can be overwhelming. So how does a real person use Igir? I'll ([@emmercm](https://github.com/emmercm/)) tell you!

## Primary ROM library

I have a 4TiB external hard drive that I use as my source of truth where I store all of my DATs, ROMs, and patches. In general, I'm more interested in cartridge-based consoles for space-saving reasons, but I have some optical-based ROMs.

The file tree in that hard drive looks like this:

```text
/Volumes/WDPassport4
├── FBNeo
│   ├── Arcade
│   └── Neogeo
├── MAME
│   └── 0.264 (Mar 27 2024)
├── No-Intro
│   ├── Nintendo - Game Boy
│   ├── Nintendo - Game Boy Advance
│   ├── Nintendo - Game Boy Advance (Multiboot)
│   ├── Nintendo - Game Boy Advance (Video)
│   ├── Nintendo - Game Boy Advance (e-Reader)
│   ├── Nintendo - Game Boy Color
│   └── etc...
├── Patches
│   ├── gb
│   ├── gba
│   ├── gbc
│   ├── genesis
│   ├── snes
│   └── etc...
├── Redump
│   ├── Microsoft - Xbox - BIOS Images
│   ├── Nintendo - GameCube
│   ├── Sony - PlayStation - BIOS Images
│   ├── Sony - PlayStation 2 - BIOS Images
│   └── etc...
├── TOSEC
│   └── Sega Dreamcast
├── igir_library_sync.sh
├── MAME 0.287 Rollback ROMs.zip
├── mame_726_0.287.xml
├── No-Intro Love Pack (PC) (2026-03-25).zip
├── No-Intro Love Pack (Standard) (Private) (2026-03-23).zip
├── Redump (2025-03-13).zip
└── TOSEC - DAT Pack - Complete (4743) (TOSEC-v2025-03-13).zip
```

The root directory has a DAT zip and subdirectory for each [DAT](../dats/introduction.md) release group. This helps separate differing quality of DATs and different DAT group ROM naming schemes. I then have one subdirectory for each game console, using the [`--dir-dat-name` option](../output/path-options.md).

The `igir_library_sync.sh` script helps me keep this collection organized and merge new ROMs into it. The complete source is:

=== ":fontawesome-brands-apple: macOS"

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

# Cartridge-based consoles, 1st-5th generations
npx --yes igir@latest move zip test clean report \
  --dat "./No-Intro*.zip" \
  --dat-name-regex-exclude "/encrypted|source code/i" \
  --input "./No-Intro" \
  "${INPUTS[@]:-}" \
  --input-checksum-max CRC32 \
  --input-checksum-archives never \
  --patch "./Patches" \
  --output "./No-Intro" \
  --dir-dat-name \
  --overwrite-invalid \
  --zip-exclude "*.{chd,iso}" \
  --reader-threads 4 \
  -v

# Disc-based consoles, 4th+ generations
npx --yes igir@latest move test clean report \
  --dat "./Redump*.zip" \
  --dat-name-regex-exclude "/Dreamcast/i" \
  --input "./Redump" \
  "${INPUTS[@]}" \
  --input-checksum-archives never \
  --output "./Redump" \
  --dir-dat-name \
  --overwrite-invalid \
  --only-retail \
  --single \
  --prefer-language EN \
  --prefer-region USA,WORLD,EUR,JPN \
  --prefer-revision newer \
  --reader-threads 4 \
  -v

# Dreamcast (because TOSEC catalogs GDEMU-compatible .gdi/.bin/.raw files and Redump catalogs .bin/.cue)
npx --yes igir@latest move test clean report \
  --dat "./TOSEC*.zip" \
  --dat-name-regex "/Dreamcast/i" \
  --dat-combine \
  --input "./TOSEC" \
  "${INPUTS[@]}" \
  --input-checksum-archives never \
  --output "./TOSEC/Sega Dreamcast" \
  --overwrite-invalid \
  --only-retail \
  --single \
  --prefer-language EN \
  --prefer-region USA,WORLD,EUR,JPN \
  --prefer-revision newer \
  --reader-threads 4 \
  -v

npx --yes igir@latest move zip test clean \
  `# Official MAME XML extracted from the progetto-SNAPS archive` \
  --dat "./mame*.xml" \
  `# Rollback DAT downloaded from Pleasuredome` \
  --dat "./MAME*Rollback*.zip" \
  --input "./MAME" \
  "${INPUTS[@]}" \
  --input-checksum-quick \
  --input-checksum-archives never \
  --output "./MAME" \
  --dir-dat-name \
  --overwrite-invalid \
  --merge-roms merged \
  -v
```

I then copy ROMs to other devices from this source of truth.

## Analogue Pocket

!!! note

    See the full [Analogue Pocket](hardware/analogue-pocket.md) page for more detailed information.

I started writing Igir while I was home-bound with COVID-19, waiting for my Analogue Pocket preorder to ship. I had tried using several other ROM managers, but found all of them unintuitive (and mostly incompatible with my MacBook).

I have this script `igir_pocket_sync.sh` at the root of my Analogue Pocket's SD card:

=== ":fontawesome-brands-apple: macOS"

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    # shellcheck disable=SC2064
    trap "cd \"${PWD}\"" EXIT
    cd "$(dirname "$0")"


    SOURCE=/Volumes/WDPassport4

    npx igir@latest copy extract test clean \
      --dat "${SOURCE}/No-Intro*.zip" \
      --dat-name-regex-exclude "/encrypted|source code|headerless|OSTs/i" \
      --input "${SOURCE}/No-Intro" \
      --input-exclude "${SOURCE}/No-Intro/Atari - 7800 \(!(A78)\)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Atari - Atari Jaguar \(!(JAG)\)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Atari - Atari Lynx \(!(LNX)\)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Commodore - Amiga*/**" \
      --input-exclude "${SOURCE}/No-Intro/Nintendo - Family Computer Disk System \(!(FDS)\)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Nintendo - Game Boy Advance (e-Reader)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Nintendo - Game Boy Advance (Play-Yan)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Nintendo - Game Boy Advance (Video)*/**" \
      --input-exclude "${SOURCE}/No-Intro/Nintendo - Nintendo 64 \(!(BigEndian)\)*/**" \
      --input-checksum-quick \
      --input-checksum-archives never \
      --patch "${SOURCE}/Patches" \
      --output "./Assets/{pocket}/common" \
      --dir-letter \
      --dir-letter-limit 1000 \
      `# Leave BIOS files alone` \
      --clean-exclude "./Assets/*/common/*.*" \
      --clean-exclude "./Assets/*/common/Palettes/**" \
      --overwrite-invalid \
      --no-bios \
      --no-bad \
      --single \
      --prefer-language EN \
      --prefer-region USA,WORLD,EUR,JPN \
      --prefer-revision newer \
      --prefer-retail \
      --reader-threads 4 \
      -v
    ```

That lets me create an EN+USA preferred 1G1R set for my Pocket on the fly, making sure I don't delete BIOS files needed for each core.

## Nintendo 64

I have this script `igir_summercart64_sync.sh` at the root of my [SummerCart64](https://summercart64.dev/) SD card:

=== ":fontawesome-brands-apple: macOS"

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    # shellcheck disable=SC2064
    trap "cd \"${PWD}\"" EXIT
    cd "$(dirname "$0")"


    SOURCE=/Volumes/WDPassport4

    npx --yes igir@latest copy extract test clean \
      --dat "${SOURCE}/No-Intro*.zip" \
      --dat-name-regex "/Nintendo 64/i" \
      --input "${SOURCE}/No-Intro/Nintendo - Nintendo 64 (BigEndian)*/**" \
      --input "${SOURCE}/No-Intro/Nintendo - Nintendo 64DD*/**" \
      --input-checksum-quick \
      --input-checksum-archives never \
      --patch "${SOURCE}/Patches" \
      --output "./Games" \
      --dir-letter \
      --overwrite-invalid \
      --no-bios \
      --no-bad \
      --single \
      --prefer-language EN \
      --prefer-region USA,WORLD,EUR,JPN \
      --prefer-revision newer \
      --prefer-retail \
      --reader-threads 4 \
      --writer-threads 1 \
      -v
    ```

## Nintendo DS

!!! note

    See the full [EZ-FLASH](hardware/ezflash.md) page for more detailed information.

I use [NDSTokyoTrim](https://gbatemp.net/threads/ndstokyotrim-batch-trimmer-with-wifi-detection.55162/) to save a significant amount of space; but unfortunately, it does not offer a CLI option. So first I manually trim decrypted ROMs, and then I have this script `igir_ezfparallel_sync.sh` at the root of my [EZ-FLASH Parallel](https://www.ezflash.cn/product/ez-flash-parallel/) SD card:

=== ":fontawesome-brands-apple: macOS"

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    # shellcheck disable=SC2064
    trap "cd \"${PWD}\"" EXIT
    cd "$(dirname "$0")"


    SOURCE=/Volumes/WDPassport4

    npx --yes igir@latest move test clean \
      --dat "${SOURCE}/No-Intro*.zip" \
      --dat-name-regex "/Nintendo DS/i" \
      --dat-name-regex-exclude "/encrypted|Nintendo DSi/i" \
      --input "${SOURCE}/NDS-Trimmed" \
      --output "./ROMs" \
      --dir-letter \
      --overwrite-invalid \
      --no-bios \
      --no-bad \
      --filter-language EN \
      --single \
      --prefer-region USA,WORLD,EUR,JPN \
      --prefer-revision newer \
      --prefer-retail \
      --clean-exclude "./ROMs/**/*.sav" \
      --reader-threads 4 \
      --writer-threads 1 \
      -v
    ```

## Nintendo GameCube

!!! note

    See the full [GameCube](console/gamecube.md) page for more detailed information.

I have this script `igir_sd2sp2_sync.sh` at the root of my GameCube [SD2SP2](https://github.com/citrus3000psi/SD2SP2) SD card:

=== ":fontawesome-brands-apple: macOS"

```bash
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT
cd "$(dirname "$0")"


SOURCE=/Volumes/WDPassport4

npx --yes igir@latest copy test clean report \
  --dat "${SOURCE}/Redump*.zip" \
  --dat-name-regex "/GameCube/i" \
  --input "${SOURCE}/Redump/Nintendo - GameCube" \
  --input-checksum-quick \
  --input-checksum-archives never \
  --patch "${SOURCE}/Patches" \
  --patch-exclude "${SOURCE}/Patches/**/*.{ups,xdelta}*" \
  --output "./Games" \
  --dir-letter \
  --overwrite-invalid \
  --filter-regex-exclude "/(Angler|Baseball|Basketball|Bass|Bonus Disc|Cabela|Disney|ESPN|F1|FIFA|Football|Golf|Madden|MLB|MLS|NASCAR|NBA|NCAA|NFL|NHL|Nickelodeon|Nick Jr|Nicktoons|PGA|Poker|Soccer|Tennis|Tonka|UFC|WWE)/i" \
  --no-bios \
  --only-retail \
  --single \
  --prefer-language EN \
  --prefer-region USA,WORLD,EUR,JPN \
  --prefer-revision newer \
  --writer-threads 1 \
  -v
```

I use the trimmed [NKit format](https://wiki.gbatemp.net/wiki/NKit) for ISOs, which don't make sense to extract, so they're copied as-is. I also exclude some games due to limited SD card size.
