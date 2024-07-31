# EverDrive

The [EverDrive](https://krikzz.com/) flash carts by Krikzz are some of the highest quality, highest rate of compatability, and most often recommended flash carts available on the market today.

## ROMs

Because flash carts are specific to a specific console, you can provide specific input directories and [DATs](../../dats/introduction.md) when you run `igir`. For example:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "Nintendo - Nintendo Entertainment System (Headered).dat" ^
      --input "ROMs-Sorted\Nintendo - Nintendo Entertainment System" ^
      --output E:\ ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/EverDrive` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Nintendo Entertainment System (Headered).dat" \
      --input "ROMs-Sorted/Nintendo - Nintendo Entertainment System" \
      --output /Volumes/EverDrive/ \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/EverDrive` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Nintendo Entertainment System (Headered).dat" \
      --input "ROMs-Sorted/Nintendo - Nintendo Entertainment System" \
      --output /media/EverDrive/ \
      --no-bios
    ```

you can then add some other output options such as the [`--dir-letter` option](../../output/path-options.md), if desired.

Alternatively, `igir` supports [Hardware Target Game Database SMDB files](https://github.com/frederic-mahe/Hardware-Target-Game-Database/tree/master/EverDrive%20Pack%20SMDBs) as [DATs](../../dats/introduction.md). Unlike typical DATs, Hardware Target Game Database SMDBs typically have an opinionated directory structure to help sort ROMs by language, category, genre, and more. Example usage:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/NES2.0%20SMDB.txt" ^
      --input "ROMs-Sorted\Nintendo - Nintendo Entertainment System" ^
      --output E:\
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/EverDrive` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/NES2.0%20SMDB.txt" \
      --input "ROMs-Sorted/Nintendo - Nintendo Entertainment System" \
      --output /Volumes/EverDrive/
    ```

=== ":simple-linux: Linux"

    Replace the `/media/EverDrive` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/NES2.0%20SMDB.txt" \
      --input "ROMs-Sorted/Nintendo - Nintendo Entertainment System" \
      --output /media/EverDrive/
    ```
