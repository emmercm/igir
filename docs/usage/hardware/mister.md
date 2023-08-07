# MiSTer FPGA

The [MiSTer FPGA](https://github.com/MiSTer-devel/Wiki_MiSTer/wiki) is a set of software for field-programmable gate array (FPGA) development boards that simulates consoles & handheld hardware. This means it can play games with perfect simulation.

## BIOS

The MiSTer [`update_all.sh`](https://github.com/theypsilon/Update_All_MiSTer) script can download BIOS files required for each core automatically, so you shouldn't need to source & sort them yourself.

## ROMs

`igir` has support for replaceable "tokens" in the `--output` option. This makes it easier to sort ROMs on devices that have an expected directory structure. The `{mister}` token exists to help sort ROMs on the MiSTer. See the [replaceable tokens page](../../output/tokens.md) for more information.

This token can be used to reference each core's specific directory in the MiSTer's `games` directory.

=== ":simple-windowsxp: Windows"

    Replace the `E:\` drive letter with wherever your SD card is:

    ```batch
    igir.exe copy extract test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs" ^
      --output "E:\games\{mister}" ^
      --dir-letter ^
      --no-bios
    ```

=== ":simple-apple: macOS"

    Replace the `/Volumes/MISTER` drive name with whatever your SD card is named:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "/Volumes/MISTER/games/{mister}/" \
      --dir-letter \
      --no-bios
    ```

=== ":simple-linux: Linux"

    Replace the `/media/MISTER` path with wherever your SD card is mounted:

    ```shell
    igir copy extract test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs/" \
      --output "/media/MISTER/games/{mister}/" \
      --dir-letter \
      --no-bios
    ```
