# Arcade ROM Sets

Building a ROM set that works with the _exact_ version of your arcade emulator is necessarily complicated, and the terminology is confusing.

This page is written to give users just enough context to build & re-build arcade ROM sets. [MAME](https://docs.mamedev.org/usingmame/aboutromsets.html), [MAMEWorld](https://easyemu.mameworld.info/mameguide/getting_started/about_roms.html), [Pleasuredome](https://pleasuredome.miraheze.org/wiki/Main_Page), [RetroArch](https://docs.libretro.com/guides/arcade-getting-started), and [RetroPie](https://retropie.org.uk/docs/Validating%2C-Rebuilding%2C-and-Filtering-ROM-Collections/?h=merge#validating-and-rebuilding-roms) are great resources to read more about the nuances of arcade emulation & ROM sets.

!!! warning

    People often shorthand all arcade emulation as "MAME," but there are other modern and actively maintained arcade emulators such as [FinalBurn Neo](https://github.com/finalburnneo/FBNeo). Different emulators have different needs, so it's important to understand what emulator and what version you're using.

## Emulator versions & DATs

Unlike traditional console emulators that only have to emulate a small set of hardware, arcade emulators have the monumental task of emulating a wildly varying number of hardware chips, inputs, and outputs. This results in each version of an emulator having a very specific set of games it can emulate, and newer emulator versions will likely add more games to this set.

Due to arcade machines being more complicated and rarer than games for home consoles, arcade ROM dumps are sometimes imperfect. Because of this, newer emulator versions may expect different ROM files than older versions. This makes ROM sets potentially incompatible between different emulator versions.

Because of all of these reasons, each arcade emulator version usually comes with a companion [DAT](../dats/introduction.md#arcade-dats) that details the _exact_ set of ROM files supported by that _exact_ emulator version. Emulators such as [MAME](https://www.mamedev.org/) take this a step further and expect an _exact_ zip file name for each game.

!!! danger

    tl;dr each arcade emulator version has an _exact_ DAT file you need to use to sort your ROMs or your games may not work!

## Finding DATs

Here is a chart of instructions for various setups:

| Emulator                                                                                                                                                                                                                           | How to get DATs                                                                                                                                                                                                                                                                                                                                                                               | Alternatives                                                                                                                                                                                                        |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Frontends ([Batocera](desktop/batocera.md), [EmulationStation](desktop/emulationstation.md), [Lakka](desktop/lakka.md), [Recalbox](desktop/recalbox.md), [RetroArch](desktop/retroarch.md), [RetroPie](desktop/retropie.md), etc.) | Each frontend's documentation should have instructions or links to download the appropriate DAT(s). For example, [RetroArch's arcade docs](https://docs.libretro.com/guides/arcade-getting-started/#step-3-use-the-correct-version-romsets-for-that-emulator) links to the exact DAT needed for each arcade core.                                                                             | N/A                                                                                                                                                                                                                 |
| [MAME](https://www.mamedev.org/)                                                                                                                                                                                                   | The easiest way to ensure you're using _exactly_ the right DAT for your MAME version is to provide the executable as `--dat ./mame`. See the [DATs page](../dats/processing.md) for more information.                                                                                                                                                                                         | A standalone download of the latest MAME ListXML can be found on the [official site](https://www.mamedev.org/release.html). See the [DATs page](../dats/introduction.md#dat-release-groups) for other alternatives. |
| [FinalBurn Neo](https://github.com/finalburnneo/FBNeo)                                                                                                                                                                             | FinalBurn Neo doesn't provide an obvious way to find the correct DAT for each version. But it is likely that you are using FinalBurn Neo through a frontend, so use the above instructions.<br><br>If you are using RetroArch's [FinalBurn Neo core](https://docs.libretro.com/library/fbneo/) then you can use [their DATs](https://github.com/libretro/FBNeo/tree/master/dats) from GitHub. | N/A                                                                                                                                                                                                                 |
| [FinalBurn Alpha](https://www.fbalpha.com/)                                                                                                                                                                                        | FinalBurn Alpha was forked into FinalBurn Neo, so you should use that if possible. Otherwise, hopefully your frontend's documentation has links to download the correct DAT.                                                                                                                                                                                                                  | N/A                                                                                                                                                                                                                 |

## ROM set merge types

There are three broadly accepted types of ROM sets, with one extra variation, resulting in four types.

First, you will want to read up on [parent/clone](../dats/introduction.md#parentclone-pc-dats) sets and how DATs catalog them.

Here is a comparison chart:

| Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Parent games                                                           | Clone games                                                                                                                    | BIOS & hardware device ROMs    | Pros & cons                                                                                                                                                                                          |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------|--------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Full non-merged**<br>The ROM set for each game contains every file necessary, including all ROM files from its parent, and BIOS & hardware device ROMs. This is the most space-inefficient way to store games because parent, BIOS, and hardware device ROMs will be duplicated potentially multiple times, but this type offers the greatest portability.<br>_Note: other tools such as [ClrMamePro](https://mamedev.emulab.it/clrmamepro/) don't offer this as a standalone type, but instead offer an option to not separate BIOS sets_.<br><br>`--merge-roms fullnonmerged` (default) | ✅ Contains all of its own ROMs, as well as BIOS & hardware device ROMs | ✅ Contains all of its own ROMs and its parent's ROMs, as well as BIOS & hardware device ROMs                                   | ✅ Included                     | Most disk space, but game files can be played entirely in isolation.<br><br>Makes for a safe default choice because of the portability of output files.                                              |
| **Non-merged**<br>The ROM set for each game contains all game files, including all ROM files from its parent, _without_ BIOS & hardware device ROMs. This means that games will depend on BIOS and hardware device ROMs existing in other archives.<br>_Note: [Pleasuredome](https://pleasuredome.miraheze.org/wiki/MAME_Split_Merged_and_Non-Merged_Sets) includes BIOS files in their non-merged sets in a non-standard way._                                                                                                              <br><br>`--merge-roms nonmerged`               | Contains all of its own ROMs, _without_ BIOS & hardware device ROMs    | 👪 Contains all of its own ROMs and its parent's ROMs, _without_ BIOS & hardware device ROMs                                   | ➡️ Expected to exist elsewhere | Game files can be played mostly in isolation while eliminating frequently duplicated BIOS & device hardware ROMs.                                                                                    |
| **Split**<br>The ROM set for each game contains only its own files, _excluding_ any ROMs that are already present in its parent.                                                                                                                                                                                                                                                                                                                                                                                                             <br><br>`--merge-roms split`                   | Contains all of its own ROMs, _without_ BIOS & hardware device ROMs    | 👶 Contains _only_ its own ROMs, _excluding_ any ROMs already present in its parent, and _without_ BIOS & hardware device ROMs | ➡️ Expected to exist elsewhere | Smallest amount of disk usage that still keeps clone games as separate files.<br><br>Makes for a good choice because of its high compatability with emulator frontends while also saving disk space. |
| **Merged**<br>The ROM set for each game and all of its clones are merged together, eliminating duplicate ROMs and preserving disk space.<br>_Note: most downloads found online will be in this format because it is the most space-efficient._                                                                                                                                                                                                                                                                                               <br><br>`--merge-roms merged`                  | Contains all of its own ROMs, _without_ BIOS & hardware device ROMs    | ➡️ Merged into its parent                                                                                                      | ➡️ Expected to exist elsewhere | Least disk space, but emulators such as RetroArch may not be able to automatically detect clones.                                                                                                    |

The ROM merge type can be specified with the `--merge-roms <type>` option, with the types described above:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip ^
      --dat "mame0258b_64bit.exe" ^
      --input <input> ^
      --output <output> ^
      --merge-roms split
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip \
      --dat "mame0258-x86/mame" \
      --input <input> \
      --output <output> \
      --merge-roms split
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "$(which "mame")" \
      --input <input> \
      --output <output> \
      --merge-roms split
    ```

## CHD disks

As arcade machines got more complicated, their storage requirements grew beyond what ROM chips can handle cost effectively. Cabinets started embedding hard drives, optical drives, laser disc drives, and more. Because backup images of these media types can get large, the MAME developers created a new compression format called "compressed hunks of data" (CHD).

MAME DATs catalog these "disks" separately from "ROMs," which lets users choose whether to care about them or not. Typically, games that require disks will not run without them, so Igir requires them for a game to be considered present/complete. You can use the `--exclude-disks` option to exclude disks and only process ROMs to save some space.

## Example: building a new ROM set

Let's say we want to build an arcade ROM set that's compatible with the most recent version of [RetroArch](desktop/retroarch.md). The steps would look like this:

1. **Determine which arcade emulator we want to use.**

    Let's say we want to use MAME, for its high accuracy.

2. **Determine the arcade emulator's version.**

    After downloading and loading the "Arcade (MAME - Current)" core in the RetroArch UI, the footer of the "core information" menu says the MAME version is "MAME (0.258 (b6d4105ea))".

3. **Locate or download the emulator version's DAT.**

   [progetto-SNAPS](https://www.progettosnaps.net/dats/MAME/) provides a mirror of mostly unaltered MAME ListXMLs, so we'll download the 0.258 (August 30, 2023) DAT from it.

4. **Obtain a set of arcade ROM files.**

    This is left as an exercise for the reader.

5. **Determine what kind of ROM set we want.**

    Let's say we care first and foremost that the arcade games "just work," and then we would like to conserve disk space. A "split" ROM set makes a good choice because RetroArch should be able to automatically index every game, including both parents and clones.

6. **Run Igir.**

  !!! note

      Most arcade emulators expect games to be in zip files, so it is important to specify the `igir zip` command.

  After determining where we want to put our ROMs, we can build our MAME v0.258 ROM set like this:

  === ":fontawesome-brands-windows: Windows (64-bit)"

      ```batch
      igir copy zip ^
        --dat "MAME_Dats_258\DATs\MAME 0.258.dat" ^
        --input "MAME-ROMs\" ^
        --output C:\RetroArch-Win64\roms\MAME-0.258 ^
        --merge-roms split
      ```

  === ":fontawesome-brands-windows: Windows (32-bit)"

      ```batch
      igir copy zip ^
        --dat "MAME_Dats_258\DATs\MAME 0.258.dat" ^
        --input "MAME-ROMs\" ^
        --output C:\RetroArch-Win32\roms\MAME-0.258 ^
        --merge-roms split
      ```

  === ":fontawesome-brands-apple: macOS"

      ```shell
      igir copy zip \
        --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
        --input "MAME-ROMs/" \
        --output ~/Documents/RetroArch/roms/MAME-0.258 \
        --merge-roms split
      ```

  === ":simple-linux: Linux"

      ```shell
      igir copy zip \
        --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
        --input "MAME-ROMs/" \
        --output ~/Documents/RetroArch/roms/MAME-0.258 \
        --merge-roms split
      ```

## Example: re-building a ROM set

Most other ROM managers use the terms "re-build" & "fix" when talking about taking an existing set of arcade ROMs, a different emulator version's DAT, and using that DAT to perform an in-place rename of the ROM files. You can think about this as "upgrading" or "downgrading" your ROM set to work with a different emulator version.

!!! note

    A game's required ROM files may change between emulator versions. This usually occurs when bad ROM dumps are replaced with better dumps. Igir cannot magically deal with these ROM differences, and Igir will only write complete ROM sets, so you may see games disappear when re-building. You will need to source the differing ROM files in order to keep your full game set.

A major reason Igir was created was to help disambiguate what it means to build & re-build ROM sets. Igir explicitly requires users to choose whether ROM files are copied or moved, so that users know what decision they're making. To "re-build" a ROM set, a user just needs to `igir move` ROMs from an input directory to the same directory specified again as the output.

Taking the MAME v0.258 set we created above, let's say we want to "downgrade" it to MAME 2003 (v0.78) because an underpowered device requires it. The steps would look like this:

1. **Locate or download the emulator version's DAT.**

   [progetto-SNAPS](https://www.progettosnaps.net/dats/MAME/) provides a mirror of mostly unaltered MAME ListXMLs, so we'll download the 0.78 (December 25, 2003) DAT from it.

2. **Optional: obtain a set of the arcade ROM files that MAME v0.78 needs that v0.258 doesn't have.**

   These are sometimes called "rollback" sets.

   This is left as an exercise for the reader.

3. **Run Igir.**

  === ":fontawesome-brands-windows: Windows (64-bit)"

      ```batch
      igir copy zip ^
        --dat "MAME Dats 0.78\MAME 078.dat" ^
        --input C:\RetroArch-Win64\roms\MAME-0.258 ^
        --input "MAME-0.78-Rollback\" ^
        --output C:\RetroArch-Win64\roms\MAME-0.78 ^
        --merge-roms split
      ```

  === ":fontawesome-brands-windows: Windows (32-bit)"

      ```batch
      igir copy zip ^
        --dat "MAME Dats 0.78\MAME 078.dat" ^
        --input C:\RetroArch-Win32\roms\MAME-0.258 ^
        --input "MAME-0.78-Rollback\" ^
        --output C:\RetroArch-Win32\roms\MAME-0.78 ^
        --merge-roms split
      ```

  === ":fontawesome-brands-apple: macOS"

      ```shell
      igir copy zip \
        --dat "MAME Dats 0.78/MAME 078.dat" \
        --input ~/Documents/RetroArch/roms/MAME-0.258 \
        --input "MAME-0.78-Rollback/" \
        --output ~/Documents/RetroArch/roms/MAME-0.78 \
        --merge-roms split
      ```

  === ":simple-linux: Linux"

      ```shell
      igir copy zip \
        --dat "MAME Dats 0.78/MAME 078.dat" \
        --input ~/Documents/RetroArch/roms/MAME-0.258 \
        --input "MAME-0.78-Rollback/" \
        --output ~/Documents/RetroArch/roms/MAME-0.78 \
        --merge-roms split
      ```

## Building other ROM sets

Sometimes people have a need to build very specific sets. Here are some instructions on how you would build them.

### BIOS set

Build a set of only BIOS files, with each in its own `.zip` file:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip ^
      --dat "MAME_Dats_258\DATs\MAME 0.258.dat" ^
      --input "MAME-ROMs\" ^
      --output "MAME-BIOS\" ^
      --only-bios
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip \
      --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
      --input "MAME-ROMs/" \
      --output "MAME-BIOS/" \
      --only-bios
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
      --input "MAME-ROMs/" \
      --output "MAME-BIOS/" \
      --only-bios
    ```

### Device set

Build a set of only device files, with each in its own `.zip` file:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip ^
      --dat "MAME_Dats_258\DATs\MAME 0.258.dat" ^
      --input "MAME-ROMs\" ^
      --output "MAME-Devices\" ^
      --only-device
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy zip \
      --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
      --input "MAME-ROMs/" \
      --output "MAME-Devices/" \
      --only-device
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "MAME_Dats_258/DATs/MAME 0.258.dat" \
      --input "MAME-ROMs/" \
      --output "MAME-Devices/" \
      --only-device
    ```
