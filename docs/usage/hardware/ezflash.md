# EZ-FLASH

The [EZ-FLASH](https://www.ezflash.cn/) flash carts for Nintendo handhelds are a cheaper alternative to other flash carts such as the [EverDrive](everdrive.md).

## ROMs

Because flash carts are specific to a specific console, you can provide specific input directories & [DATs](../../dats/introduction.md) when you run `igir`. For example:

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir copy extract test clean ^
      --dat "Nintendo - Game Boy.dat" ^
      --input "ROMs-Sorted\Nintendo - Game Boy" ^
      --output E:\ ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/EZFLASH` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Game Boy.dat" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /Volumes/EZFLASH/ \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/EZFLASH` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "Nintendo - Game Boy.dat" \
      --input "ROMs-Sorted/Nintendo - Game Boy" \
      --output /media/EZFLASH/ \
      --no-bios
    ```

you can then add some other output options such as the [`--dir-letter` option](../../output/path-options.md), if desired.

!!! warning

    The EZ-FLASH appears to have issues with fragmented files, in the same way that [GameCube's Swiss](../console/gamecube.md) and [PS2's OPL](../console/ps2.md) does ([igir#802](https://github.com/emmercm/igir/discussions/802#discussioncomment-7606831)).

    You may need to set the option `--writer-threads 1` to fix any issues with your specific model.

Even though [Hardware Target Game Database](https://github.com/frederic-mahe/Hardware-Target-Game-Database) uses the word "EverDrive" in their database files, there is no reason you can't use them with other flash carts such as the EZ-FLASH. See an example usage of them in the [EverDrive](everdrive.md) documentation.
