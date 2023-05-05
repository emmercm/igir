# EverDrive

Because flash carts are specific to a specific console, you can provide specific input directories & [DATs](../../dats.md) when you run `igir`. For example:

=== "Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "Nintendo - Game Boy.dat" ^
      --input "ROMs-Sorted/Nintendo - Game Boy" ^
      --output E:\ ^
      --no-bios
    ```

=== "macOS"

    Replace the `/Volumes/EverDrive` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Game Boy.dat" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/EverDrive/ \
      --no-bios
    ```

you can then add some other output options such as `--dir-letter`, if desired.

Alternatively, `igir` supports [Hardware Target Game Database SMDB files](https://github.com/frederic-mahe/Hardware-Target-Game-Database/tree/master/EverDrive%20Pack%20SMDBs) as [DATs](../../dats.md). Unlike typical DATs, Hardware Target Game Database SMDBs typically have an opinionated directory structure to help sort ROMs by language, category, genre, and more. Example usage:

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
