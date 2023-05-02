# Example Usage

!!! info

    See the `igir --help` message for a few common examples.

## Example scenario

### First time collection sort

First, you need to download a set of [DATs](dats.md). For these examples I'll assume you downloaded a No-Intro daily P/C XML `.zip`.

Let's say that you have a directory named `ROMs/` that contains ROMs for many different systems, and it needs some organization. To make sure we're alright with the output, we'll have `igir` copy these files rather than move them. We'll also zip them to reduce disk space & speed up future scans.

=== "Windows"

    ```batch
    igir.exe copy zip test ^
      --dat "No-Intro*.zip" ^
      --input ROMs/ ^
      --output ROMs-Sorted/ ^
      --dir-dat-name
    ```

=== "macOS"

    ```shell
    igir copy zip test \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

This will organize your ROMs into system-specific subdirectories within `ROMs-Sorted/` and name all of your ROMs accurately. Because we copied and didn't move, no files were deleted from the `ROMs/` input directory.

`ROMs-Sorted/` then might look something like this:

```text
ROMs-Sorted
├── Nintendo - Game Boy
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).zip
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).zip
├── Nintendo - Game Boy Advance
│   ├── Pokemon - Emerald Version (USA, Europe).zip
│   └── Pokemon - Sapphire Version (USA, Europe) (Rev 2).zip
└── Nintendo - Game Boy Color
    ├── Pokemon - Crystal Version (USA, Europe) (Rev 1).zip
    └── Pokemon Pinball (USA, Australia) (Rumble Version) (SGB Enhanced) (GB Compatible).zip
```

[![asciicast](https://asciinema.org/a/rOWJwgbbODaXuQeQY4B6uWc4i.svg)](https://asciinema.org/a/rOWJwgbbODaXuQeQY4B6uWc4i)

### Subsequent collection sorts

Let's say that we've done the above first time sort and were happy with the results. We can now consider the `ROMs-Sorted/` directory to be our primary collection, every file in there has been matched to a DAT.

Now we have new ROMs that we want to merge into our collection, and we want to generate a [report](reporting.md) of what ROMs are still missing. We also want to delete any unknown files that may have made their way into our collection.

=== "Windows"

    ```batch
    igir.exe move zip test clean report ^
      --dat "No-Intro*.zip" ^
      --input ROMs-New/ ^
      --input ROMs-Sorted/ ^
      --output ROMs-Sorted/ ^
      --dir-dat-name
    ```

=== "macOS"

    ```shell
    igir move zip test clean report \
      --dat "No-Intro*.zip" \
      --input ROMs-New/ \
      --input ROMs-Sorted/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

Any new ROMs in `~/Downloads/` that we didn't already have in `ROMs-Sorted/` will be moved, and a report will be generated for us.

`ROMs-Sorted/` then might look something like this, with new ROMs added:

```text
ROMs-Sorted
├── Nintendo - Game Boy
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).zip
│   ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).zip
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).zip
├── Nintendo - Game Boy Advance
│   ├── Pokemon - Emerald Version (USA, Europe).zip
│   ├── Pokemon - Ruby Version (USA, Europe) (Rev 2).zip
│   └── Pokemon - Sapphire Version (USA, Europe) (Rev 2).zip
└── Nintendo - Game Boy Color
    ├── Pokemon - Crystal Version (USA, Europe) (Rev 1).zip
    └── Pokemon Pinball (USA, Australia) (Rumble Version) (SGB Enhanced) (GB Compatible).zip
```

[![asciicast](https://asciinema.org/a/PWAfBcvCikzJ7wObLcdFGtZbI.svg)](https://asciinema.org/a/PWAfBcvCikzJ7wObLcdFGtZbI)

### Flash cart 1G1R

Let's say we've done the above sorting we want to copy some ROMs from `ROMs-Sorted/` to a flash cart.

We would prefer having only one copy of every game (1G1R), so there is less to scroll through to find what we want, and because we have a preferred language. Our flash cart can't read `.zip` files, so we'll need to extract our ROMs during copying.

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Sorted/Nintendo - Game Boy" ^
      --output E:\ ^
      --dir-letter ^
      --single ^
      --prefer-language EN ^
      --prefer-region USA,WORLD,EUR,JPN
    ```

=== "macOS"

    Replace the `/Volumes/FlashCart` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/FlashCart/ \
      --dir-letter \
      --single \
      --prefer-language EN \
      --prefer-region USA,WORLD,EUR,JPN
    ```

Your flash cart might then look something like this:

```text
/Volumes/FlashCart
└── P
    ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
    ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
    └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
```

[![asciicast](https://asciinema.org/a/K8ROFbX8c4NJfUue3lwbe7d8V.svg)](https://asciinema.org/a/K8ROFbX8c4NJfUue3lwbe7d8V)

!!! info

    See the [ROM filtering](rom-filtering.md) page for other ways that you can filter your collection.

## Specific emulator frontends

### RetroArch

!!! info

    [RetroArch](https://www.retroarch.com/) is a frontend UI for the [Libretro API](https://www.libretro.com/).

First, RetroArch needs a number of [BIOS files](https://docs.libretro.com/library/bios/). Thankfully, the libretro team maintains a DAT of these "system" files, so we don't have to guess at the correct filenames.

With `igir`'s support for [DAT URLs](dats.md) we don't even have to download it! Locate your "System/BIOS" directory as configured in RetroArch and use it as your output directory:

=== "Windows (64-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS/ ^
      --output C:\RetroArch-Win64\system
    ```

=== "Windows (32-bit)"

    The root directory is based on where you installed RetroArch, but by default it is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS/ ^
      --output C:\RetroArch-Win32\system
    ```

=== "macOS"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output ~/Documents/RetroArch/system/
    ```

RetroArch is less opinionated about where your ROMs can live, you have to specify "content" directories during setup.

!!! note

    If you want store your ROMs in the RetroArch folder, you could co-locate them near your BIOS files:

    === "Windows (64-bit)"

        The root directory is based on where you installed RetroArch, but by default it is:

        ```batch
        igir.exe copy zip test ^
          --dat "No-Intro*.zip" ^
          --input ROMs/ ^
          --output C:\RetroArch-Win64\roms ^
          --dir-dat-name
        ```

    === "Windows (32-bit)"

        The root directory is based on where you installed RetroArch, but by default it is:

        ```batch
        igir.exe copy zip test ^
          --dat "No-Intro*.zip" ^
          --input ROMs/ ^
          --output C:\RetroArch-Win32\roms ^
          --dir-dat-name
        ```

    === "macOS"

        ```shell
        igir copy zip test \
          --dat "No-Intro*.zip" \
          --input ROMs/ \
          --output ~/Documents/RetroArch/roms \
          --dir-dat-name
        ```

From there, all you should have to do is "[import content](https://docs.libretro.com/guides/import-content/)."

### EmulationStation Desktop Edition (ES-DE)

!!! info

    [EmulationStation Desktop Edition](https://es-de.org) is a frontend for [RetroArch](https://www.retroarch.com/), so the instructions are the same as RetroArch.

### RetroPie

!!! info

    [RetroPie](https://retropie.org.uk/) is an installer for [EmulationStation](https://emulationstation.org/) & [RetroArch](https://www.retroarch.com/) on single-board computers (SBCs).

Because RetroPie uses RetroArch under the hood, the instructions are generally the same. By default, the RetroPie BIOS directory is `/home/pi/RetroPie/BIOS`:

=== "RetroPie (Linux)"

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /home/pi/RetroPie/BIOS
    ```

## Specific consoles & hardware

### OnionOS (Miyoo) / GarlicOS (Anbernic)

!!! info

    [OnionOS](https://github.com/OnionUI/Onion) is based on [RetroArch](https://www.retroarch.com/), and [GarlicOS](https://www.patreon.com/posts/76561333) is based on OnionOS, so most instructions are very similar.

OnionOS has its BIOS folder at the root of the SD card at `/BIOS`, and it uses the [RetroArch filenames](https://github.com/OnionUI/Onion/wiki/Installation#step-3-copy-over-your-bios-and-rom-files):

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" ^
      --input BIOS/ ^
      --output E:\BIOS
    ```

=== "macOS"

    Replace the `/Volumes/OnionOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/System.dat" \
      --input BIOS/ \
      --output /Volumes/OnionOS/BIOS
    ```

OnionOS uses its own proprietary [ROM folder structure](https://github.com/OnionUI/Onion/wiki/Emulators#rom-folders---quick-reference), so `igir` has a replaceable `{onion}` token to sort ROMs into the right place.

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input ROMs/ ^
      --output E:\Roms\{onion} ^
      --dir-letter
    ```

=== "macOS"

    Replace the `/Volumes/OnionOS` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output /Volumes/OnionOS/Roms/{onion} \
      --dir-letter
    ```

### EverDrive flash carts

Because flash carts are specific to a specific console, you can provide specific input directories & DATs when you run `igir`. For example:

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "Nintendo - Game Boy.dat" ^
      --input "ROMs-Sorted/Nintendo - Game Boy" ^
      --output E:\
    ```

=== "macOS"

    Replace the `/Volumes/EverDrive` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Game Boy.dat" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/EverDrive/
    ```

you can then add some other output options such as `--dir-letter`, if desired.

Alternatively, `igir` supports [Hardware Target Game Database SMDB files](https://github.com/frederic-mahe/Hardware-Target-Game-Database/tree/master/EverDrive%20Pack%20SMDBs) as [DATs](dats.md). Unlike typical DATs, Hardware Target Game Database SMDBs typically have an opinionated directory structure to help sort ROMs by language, category, genre, and more. Example usage:

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/EverDrive%20GB%20SMDB.txt" ^
      --input "ROMs-Sorted/Nintendo - Game Boy" ^
      --output E:\
    ```

=== "macOS"

    Replace the `/Volumes/EverDrive` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/EverDrive%20GB%20SMDB.txt" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/EverDrive/
    ```

## Personal usage

`igir` has many options available to fit almost any use case, but the number of options can be overwhelming. So that begs a question: _how do I, the author of `igir`, use `igir` in the real world?_

### Primary ROM library

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

The root directory has a DAT zip and subdirectory for each [DAT](dats.md) release group. This helps separate differing quality of DATs and different DAT group ROM naming schemes. I then have one subdirectory for each game console, using the `--dir-dat-name` option.

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

npx igir@latest move zip test clean report \
  --dat "./No-Intro*.zip" \
  --input "./No-Intro/" \
  "${INPUTS[@]}" \
  --patch "./Patches/" \
  --output "./No-Intro/" \
  --dir-dat-name

npx igir@latest move extract test report \
  --dat "./Redump*.zip" \
  --input "./Redump/" \
  "${INPUTS[@]}" \
  --output "./Redump/" \
  --dir-dat-name
```

I then copy ROMs to other devices from this source of truth.

### Analogue Pocket

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

### GameCube

I have this script `sd2sp2_pocket_sync.sh` at the root of my GameCube [SD2SP2](https://github.com/citrus3000psi/SD2SP2) SD card:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE=/Volumes/WDPassport4

npx igir@latest copy extract test clean \
  --input "${SOURCE}/Redump/Nintendo - GameCube" \
  --output "./ISOs/" \
  --dir-letter \
  --no-bios \
  --no-bad \
  --filter-regex-exclude "/(Baseball|FIFA|MLB|NBA|NCAA|NFL|NHL|PGA)/i"
```

It doesn't use DATs because I have the ISOs in a trimmed NKit format (see [Swiss](https://github.com/emukidid/swiss-gc)), so they won't match the checksums in DATs. I also exclude some games due to limited SD card size.
