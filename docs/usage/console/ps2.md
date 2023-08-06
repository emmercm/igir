# PlayStation 2

## Open PS2 Loader (OPL)

[OPL](https://github.com/ps2homebrew/Open-PS2-Loader) is typically used to load game backups on the PS2. See the [PS2-HOME Forums](https://www.ps2-home.com/forum/viewforum.php?f=50) for resources on installing & running OPL.

!!! warning

    OPL is sensitive to files being fragmented on USB drives and SD cards (MX4SIO/SIO2SD). This means that you should only write one ISO at a time!

`igir` has a `--writer-threads` option to limit the number of files being written at once. You can use the option like this:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your USB drive is:

    ```batch
    igir copy extract test clean ^
      --dat "Redump*.zip" ^
      --input "ISOs" ^
      --output "E:\DVD" ^
      --dir-letter ^
      --writer-threads 1
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/PS2` drive name with whatever your USB drive is named:

    ```shell
    igir copy extract test clean \
      --dat "Redump*.zip" \
      --input "ISOs/" \
      --output "/Volumes/PS2/DVD/" \
      --dir-letter \
      --writer-threads 1
    ```
