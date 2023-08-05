# Collection Sorting

A walkthrough of an example way to sort your ROM collection.

!!! info

    See the `igir --help` message for a few common examples.

## First time collection sort

First, you need to download a set of [DATs](../input/dats.md). For these examples I'll assume you downloaded a No-Intro daily P/C XML `.zip`.

Let's say that you have a directory named `ROMs/` that contains ROMs for many different systems, and it needs some organization. To make sure we're alright with the output, we'll have `igir` copy these files rather than move them. We'll also zip them to reduce disk space & speed up future scans.

=== ":simple-windowsxp: Windows"

    ```batch
    igir.exe copy zip test ^
      --dat "No-Intro*.zip" ^
      --input ROMs/ ^
      --output ROMs-Sorted/ ^
      --dir-dat-name
    ```

=== ":simple-apple: macOS"

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

## Subsequent collection sorts

Let's say that we've done the above first time sort and were happy with the results. We can now consider the `ROMs-Sorted/` directory to be our primary collection, every file in there has been matched to a DAT.

Now we have new ROMs that we want to merge into our collection, and we want to generate a [report](../output/reporting.md) of what ROMs are still missing. We also want to delete any unknown files that may have made their way into our collection.

=== ":simple-windowsxp: Windows"

    ```batch
    igir.exe move zip test clean report ^
      --dat "No-Intro*.zip" ^
      --input ROMs-New/ ^
      --input ROMs-Sorted/ ^
      --output ROMs-Sorted/ ^
      --dir-dat-name
    ```

=== ":simple-apple: macOS"

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

## Flash cart 1G1R

Let's say we've done the above sorting we want to copy some ROMs from `ROMs-Sorted/` to a flash cart.

We would prefer having only one copy of every game (1G1R), so there is less to scroll through to find what we want, and because we have a preferred language. Our flash cart can't read `.zip` files, so we'll need to extract our ROMs during copying.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Sorted/Nintendo - Game Boy" ^
      --output E:\ ^
      --dir-letter ^
      --no-bios ^
      --single ^
      --prefer-language EN ^
      --prefer-region USA,WORLD,EUR,JPN
    ```

=== ":simple-apple: macOS"

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

    See the [ROM filtering & preference](../rom-filtering.md) page for other ways that you can filter your collection.
