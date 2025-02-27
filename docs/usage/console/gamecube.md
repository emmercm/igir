# GameCube

## Swiss

[Swiss](https://github.com/emukidid/swiss-gc) is typically used to load game backups on the GameCube. See the [GC-Forever Wiki](https://www.gc-forever.com/wiki/index.php?title=Main_Page) for resources on installing & running Swiss.

!!! warning

    Swiss is sensitive to files being fragmented on SD cards ([swiss-gc#763](https://github.com/emukidid/swiss-gc/issues/763), [swiss-gc#122](https://github.com/emukidid/swiss-gc/issues/122), etc.). This means that you should only write one ISO at a time!

Igir has a `--writer-threads <threads>` option to limit the number of files being written at once. You can use the option like this:

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy test clean ^
      --dat "Redump*.zip" ^
      --dat-name-regex '/gamecube/i' ^
      --input "Games" ^
      --output "E:\Games" ^
      --dir-letter ^
      --writer-threads 1
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/SD2SP2` drive name with whatever your SD card is named:

    ```shell
    igir copy test clean \
      --dat "Redump*.zip" \
      --dat-name-regex '/gamecube/i' \
      --input "Games/" \
      --output "/Volumes/SD2SP2/Games/" \
      --dir-letter \
      --writer-threads 1
    ```

=== ":simple-linux: Linux"

    Replace the `/media/SD2SP2` path with wherever your SD card is mounted:

    ```shell
    igir copy test clean \
      --dat "Redump*.zip" \
      --dat-name-regex '/gamecube/i' \
      --input "Games/" \
      --output "/media/SD2SP2/Games/" \
      --dir-letter \
      --writer-threads 1
    ```

## NKit

Swiss supports ISOs in the trimmed [NKit format](https://wiki.gbatemp.net/wiki/NKit), which can save significant space on your SD card. Some games such as Animal Crossing can be compressed as small as 28MB, while other games such as Wave Race: Blue Storm don't compress much at all.

Igir can read the original ISO's CRC32 information stored in `.nkit.iso` files, which means it can match files to DATs (as long as you don't raise the [minimum checksum level](../../roms/matching.md#manually-using-other-checksum-algorithms)!). However, Igir can't extract NKit ISOs, you'll need to use Nanook's [NKit tool](https://wiki.gbatemp.net/wiki/NKit#Download) instead.
