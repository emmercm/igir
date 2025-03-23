# Basic Usage Examples

A walkthrough of an example way to sort your ROM collection.

!!! info

    See the `igir --help` message for a few common examples.

## With DATs

Even though Igir can work without [DATs](../dats/introduction.md), using DATs to sort your collection is the [best practice](best-practices.md) to end up with the most accurate and organized set of ROMs.

### First time collection sort

First, you need to download a set of [DATs](../dats/introduction.md). For these examples I'll assume you downloaded a No-Intro daily P/C XML `.zip`.

Let's say that you have a directory named `ROMs/` that contains ROMs for many different systems, and it needs some organization. To make sure we're alright with the output, we'll have Igir copy these files to a different directory rather than move them. We'll also [zip](../output/writing-archives.md) them to reduce disk space & speed up future scans.

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip test ^
      --dat "No-Intro*.zip" ^
      --input ROMs\ ^
      --output ROMs-Sorted\ ^
      --dir-dat-name
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip test \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip test \
      --dat "No-Intro*.zip" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

This will organize your ROMs into system-specific subdirectories within the `ROMs-Sorted/` directory and name all of your ROMs according to the No-Intro DATs. Because we copied and didn't move the files, no files were deleted from the `ROMs/` input directory.

`ROMs-Sorted/` then might look something like this:

```text
ROMs-Sorted/
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

<script src="https://asciinema.org/a/J6RnpFif6QJrkageFvKH39btk.js" id="asciicast-J6RnpFif6QJrkageFvKH39btk" async="true"></script>

!!! info

    See the [output path options](../output/path-options.md) and [output path tokens](../output/tokens.md) pages for other ways that you can organize your collection.

### Subsequent collection sorts

Let's say that we've done the above first time sort and were happy with the results. We can now consider the `ROMs-Sorted/` directory to be our "golden" or "primary" collection, as every file in there has been matched to a DAT.

We now have new ROMs that we want to merge into our collection, and we want to generate a [report](../output/reporting.md) of what ROMs are still missing. We also want to "[clean](../output/cleaning.md)" or delete any unknown files that may have made their way into our collection.

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move zip test clean report ^
      --dat "No-Intro*.zip" ^
      --input ROMs-New\ ^
      --input ROMs-Sorted\ ^
      --output ROMs-Sorted\ ^
      --dir-dat-name
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move zip test clean report \
      --dat "No-Intro*.zip" \
      --input ROMs-New/ \
      --input ROMs-Sorted/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move zip test clean report \
      --dat "No-Intro*.zip" \
      --input ROMs-New/ \
      --input ROMs-Sorted/ \
      --output ROMs-Sorted/ \
      --dir-dat-name
    ```

Any new ROMs in `ROMs-New/` that we didn't already have in `ROMs-Sorted/` will be moved to `ROMs-Sorted/`, and a report will be generated for us.

!!! note

    Note that we're using `ROMs-Sorted/` as both an input directory _and_ as the output directory. This is required to ensure the [`clean` command](../output/cleaning.md) doesn't delete "good" files already in the output directory!

    You can always use the [`--clean-dry-run` option](../output/cleaning.md#dry-run) to see what files would be deleted without actually deleting them.

`ROMs-Sorted/` then might look something like this, with new ROMs added:

```text
ROMs-Sorted/
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

<script src="https://asciinema.org/a/WAip4pJrNIKk0IGamov7Js4ba.js" id="asciicast-WAip4pJrNIKk0IGamov7Js4ba" async="true"></script>

### Flash cart 1G1R

Let's say we've done the above sorting we want to copy some ROMs from `ROMs-Sorted/` to a flash cart.

We would prefer having only one copy of every game because we have a preferred language, and so there is less to scroll through to find what game we want.

!!! note

    The common name for this is "one-game, one-ROM" or "1G1R"—this is what Igir is named after! Igir has some of the most extensive [filtering](../roms/filtering-preferences.md#filters) and [1G1R options](../roms/filtering-preferences.md#preferences-for-1g1r) of any ROM manager.

Our example flash cart, like most flash carts, can't read `.zip` files, so we'll need to extract our ROMs during copying.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Sorted\Nintendo - Game Boy" ^
      --output E:\ ^
      --dir-letter ^
      --no-bios ^
      --single ^
      --prefer-language EN ^
      --prefer-region USA,WORLD,EUR,JPN
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/FlashCart` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/FlashCart/ \
      --dir-letter \
      --no-bios \
      --single \
      --prefer-language EN \
      --prefer-region USA,WORLD,EUR,JPN
    ```

=== ":simple-linux: Linux"

    Replace the `/media/FlashCart` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /media/FlashCart/ \
      --dir-letter \
      --no-bios \
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

<script src="https://asciinema.org/a/GxXyngUlZ5Xg8pCh6GhJdDc4t.js" id="asciicast-GxXyngUlZ5Xg8pCh6GhJdDc4t" async="true"></script>

## Without DATs

ROM organization is very opinion-based, and your opinion may not match that of DAT groups. To preserve your custom ROM sorting, you can skip providing any DATs by omitting the `--dat <path>` option.

!!! note

    If your custom ROM sorting includes directories, you will want to provide the [`--dir-mirror` option](../output/path-options.md#mirror-the-input-subdirectory) to preserve the structure.

### Extracting or zipping all ROMs

It is possible to extract or zip your ROM files en masse without complicated Bash or Batch scripts, and you can do this without DATs because the root of the filename won't change.

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move extract test ^
      --input "ROMs\" ^
      --output "ROMs\" ^
      --dir-mirror
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move extract test \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move extract test \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror
    ```

<script src="https://asciinema.org/a/cD0dtLJEypOEi27aSyGsrLxIO.js" id="asciicast-cD0dtLJEypOEi27aSyGsrLxIO" async="true"></script>

### Fixing file extensions

Igir is able to detect more than 60 ROM and archive file types and automatically correct file extensions when needed during writing. See the [writing options](../output/options.md#fixing-rom-extensions) page for more information.

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move extract test ^
      --input "ROMs\" ^
      --output "ROMs\" ^
      --dir-mirror ^
      --fix-extension always
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move extract test \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror \
      --fix-extension always
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move extract test \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror \
      --fix-extension always
    ```

<script src="https://asciinema.org/a/kqfIeEsHcQhOWwnBFS69n5els.js" id="asciicast-kqfIeEsHcQhOWwnBFS69n5els" async="true"></script>
