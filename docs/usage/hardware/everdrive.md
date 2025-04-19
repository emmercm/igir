# EverDrive

The [EverDrive](https://krikzz.com/) flash carts by Krikzz are some of the highest quality, highest rate of compatability, and most often recommended flash carts available on the market today.

## ROMs

Because flash carts are specific to a specific console, you can provide specific input directories and [DATs](../../dats/introduction.md) when you run Igir. For example:

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "Nintendo - Nintendo Entertainment System (Headered).dat" ^
      --input "ROMs-Sorted\Nintendo - Nintendo Entertainment System" ^
      --output E:\ ^
      --no-bios
    ```

=== ":fontawesome-brands-apple: macOS"

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

Alternatively, Igir supports [Hardware Target Game Database SMDB files](https://github.com/frederic-mahe/Hardware-Target-Game-Database/tree/master/EverDrive%20Pack%20SMDBs) as [DATs](../../dats/introduction.md). Unlike typical DATs, Hardware Target Game Database SMDBs typically have an opinionated directory structure to help sort ROMs by language, category, genre, and more. Example usage:

!!! tip

    You can achieve a result similar to the Hardware Target Game Database DATs with the following options:

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir [commands..] ^
          [options] ^
          --output "{datName}\{region}" ^
          --dir-letter ^
          --dir-letter-group ^
          --dir-letter-limit 200
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir [commands..] \
          [options] \
          --output "{datName}/{region}" \
          --dir-letter \
          --dir-letter-group \
          --dir-letter-limit 200
        ```

    === ":simple-linux: Linux"

        ```shell
        igir [commands..] \
          [options] \
          --output "{datName}/{region}" \
          --dir-letter \
          --dir-letter-group \
          --dir-letter-limit 200
        ```

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "https://raw.githubusercontent.com/frederic-mahe/Hardware-Target-Game-Database/master/EverDrive%20Pack%20SMDBs/NES2.0%20SMDB.txt" ^
      --input "ROMs-Sorted\Nintendo - Nintendo Entertainment System" ^
      --output E:\
    ```

=== ":fontawesome-brands-apple: macOS"

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
