# Best Practices

## DATs

**Use DATs.**

While [DATs](../dats/introduction.md) are optional, they allow you to organize your ROMs in a human-understandable manner and [remove](../output/cleaning.md) unknown files. Additional metadata provided by some DAT groups allows you [filter your ROM set](../roms/filtering-preferences.md) to only what you care about.

**Choose DAT groups with parent/clone information.**

[Parent/clone information](../dats/introduction.md#parentclone-pc-dats) lets you apply [1G1R preference rules](../roms/filtering-preferences.md). For example, prefer No-Intro's Game Boy DAT over TOSEC's, as TOSEC doesn't provide parent/clone information.

**Use consistent versions across all devices.**

DATs work best if you store them alongside your primary ROM collection and when you use the same DAT versions across all devices (i.e. your primary collection, handhelds, flash carts, etc.). Some DAT groups release new versions as often as daily, so keeping your collection in sync is easier with consistent DATs.

**Process DATs from different groups separately.**

DAT groups have some overlap between them, so using DATs from multiple groups at the same time may cause duplicate files or filename collisions. Different groups also have different conventions that may require different settings, such as [filters](../roms/filtering-preferences.md#filters) and [1G1R preferences](../roms/filtering-preferences.md#preferences-for-1g1r).

Keep ROM sets organized by DATs from different groups in separate directories. For example, create different directories for No-Intro, Redump, and TOSEC-organized ROM sets.

## File Inputs

**Keep one primary collection and then copy to other sub-collections.**

Having a consolidated collection that only consists of ROMs matched to DATs allows for easy copying to other places, such as flash carts. This will allow you to recreate sub-collections in case of any file loss.

Additionally, sub-collections are likely to have [filtering and preference rules](../roms/filtering-preferences.md) applied based on the use case, but you may not want to filter out ROMs from your primary collection in the same way.

**Provide the output directory as an input directory when cleaning.**

If you use new DATs with an existing collection that may have changed ROM names, then [`igir clean`](../output/cleaning.md) may delete files from your output directory that have the wrong filename.

The solution is to provide the output directory as an additional [input](../roms/scanning.md) directory, allowing Igir to move/rename files to the updated name. Igir will only ever [copy](../commands.md#copy) or [move](../commands.md#move) files from an input directory to the output directory, allowing users to be very intentional with Igir's behavior.

Example:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move clean ^
      --input ROMs ^
      --input "%UserProfile%\Downloads" ^
      --output ROMs
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move clean \
      --input ROMs \
      --input ~/Downloads \
      --output ROMs
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move clean \
      --input ROMs \
      --input ~/Downloads \
      --output ROMs
    ```

**Prefer ROMs with headers.**

Igir can [remove headers automatically](../roms/headers.md#automatic-header-removal) when needed, but it cannot add them back. Keep ROMs with headers in your primary collection and then modify them when copying to other devices as needed.

**Don't use quick scanning unless you absolutely need it.**

The default settings for Igir will have the best chance for you to match input files to DATs. Using the [`--input-checksum-quick` option](../roms/matching.md#quick-scanning-files) will reduce those chances.

**Don't increase the minimum checksum level unless you absolutely need it.**

The default settings for Igir will cause accurate file matching for the gross majority of cases with the least amount of processing. Additionally, most [archive formats](../input/reading-archives.md) only store CRC32 checksums, so forcing any others will greatly increase scanning time. Use the [`--input-checksum-min <algorithm>` option](../roms/matching.md#manually-using-other-checksum-algorithms) with caution.

## File Outputs

**Zip ROMs whenever it makes sense.**

Zip files generally save file space and are faster to scan, at the expense of requiring more processing time to create them. For collections that will be read from more often than written to (such as a primary collection), prefer to spend the time to [archive files](../output/writing-archives.md) once with the `igir zip` command.

**Organize ROM sets by DAT name or description.**

Ignoring [arcade ROM sets](../usage/arcade.md), one purpose of sorting your ROM collection using DATs is to organize them in some human-understandable manner. A common way to help with this is to group ROMs from the same console together using [`--dir-dat-name`](../output/path-options.md#append-dat-name) or [`--dir-dat-description`](../output/path-options.md#append-dat-description).

Alternatively, you can [filter to only the DATs](../dats/processing.md#dat-filtering) you want and then [combine them](../dats/processing.md#dat-combining) and write the resulting ROMs to one directory.

**Organize ROMs by letter for non-keyboard & mouse devices.**

Devices that only have a D-pad to browse through files can make ROM selection tedious. Use the [`--dir-letter` option](../output/path-options.md#append-game-letters) and its `--dir-letter-*` modifier options to make this easier with large collections.

**Use the default game name appending option.**

Igir will automatically group games with multiple ROMs together into their own subfolder. Leave this [`--dir-game-subdir <mode>` option](../output/path-options.md#append-the-game-name) as the default unless you know what you're doing.

**Overwrite invalid files.**

If you value keeping a clean and accurate ROM collection, use the [`--overwrite-invalid` option](../output/options.md) to overwrite files in the output directory that don't match what's expected with a "valid" file.

## Arcade

**Use the right DAT version for your emulator version.**

You must choose the right DAT for your emulator (e.g. MAME) and emulator version (e.g. MAME 0.258) or your ROMs may not work correctly. See the [arcade ROM sets page](../usage/arcade.md#emulator-versions-dats) for more information.

**For MAME, use the official DATs or ones from progetto-SNAPS.**

These DATs provide the most flexibility (i.e. can use any merge type) and the most amount of metadata (i.e. [parent/clone information](../dats/introduction.md#parentclone-pc-dats), ROMs & CHDs together in one DAT) for Igir to use for processing. Other DAT groups such as pleasuredome modify the official DATs quite heavily by pre-applying filters.

**Pick a ROM merge type intentionally.**

Igir will produce full non-merged sets by default for the highest level of compatibility. However, you should understand the difference between the supported [merge types](../usage/arcade.md#rom-set-merge-types) and choose one that best suits your needs.

## Advanced

**Use an SSD or a RAM drive for the temp directory.**

Igir sometimes needs to write files to a [temporary directory](../advanced/temp-dir.md), such as when extracting archives that it [can't read natively](../input/reading-archives.md). Using a fast hard drive for this directory can speed up processing.
