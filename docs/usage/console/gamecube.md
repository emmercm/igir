# GameCube

## Swiss

[Swiss](https://github.com/emukidid/swiss-gc) is typically used to load game backups on the GameCube. See the [GC-Forever Wiki](https://www.gc-forever.com/wiki/index.php?title=Main_Page) for resources on installing & running Swiss.

!!! warning

    Swiss is sensitive to files being fragmented on SD cards ([swiss-gc#763](https://github.com/emukidid/swiss-gc/issues/763), [swiss-gc#122](https://github.com/emukidid/swiss-gc/issues/122), etc.). This means that you should only write one ISO at a time!

`igir` has a `--writer-threads` option to limit the number of files being written at once. You can use the option like this:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "Redump*.zip" ^
      --input "ISOs" ^
      --output "E:\ISOs" ^
      --dir-letter ^
      --writer-threads 1
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/SD2SP2` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "Redump*.zip" \
      --input "ISOs/" \
      --output "/Volumes/SD2SP2/ISOs/" \
      --dir-letter \
      --writer-threads 1
    ```

=== ":simple-linux: Linux"

    Replace the `/media/SD2SP2` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "Redump*.zip" \
      --input "ISOs/" \
      --output "/media/SD2SP2/ISOs/" \
      --dir-letter \
      --writer-threads 1
    ```
