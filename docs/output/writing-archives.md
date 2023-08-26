# Writing Archives

`igir` supports creating `.zip` archives with the `igir zip` [command](../commands.md).

!!! note

    It is intentional that `igir` only supports `.zip` archives right now.

    `.zip` archives store CRC32 information in their "file table" which helps drastically speed up `igir`'s file scanning, and they are easy to create without proprietary tools (e.g. Rar).

See the [reading archives](../input/reading-archives.md) page for more information on archive formats and their capabilities.

## Example: zipping a ROM collection

One aspect of organizing a ROM collection is to ensure a consistent archive format. You can ensure all ROMs in a collection are in a `.zip` archive like this:

=== ":simple-windowsxp: Windows"

    ```batch
    igir move zip --dat "*.dat" --input "ROMs\" --output "ROMs\"
    ```

=== ":simple-apple: macOS"

    ```shell
    igir move zip --dat "*.dat" --input "ROMs/" --output "ROMs/"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move zip --dat "*.dat" --input "ROMs/" --output "ROMs/"
    ```

## Excluding files from zipping

There are multiple reasons why you might need some files to be extracted and not in a `.zip` archive:

- Most emulators don't support archived BIOS files
- Some emulators don't support archived disc formats such as `.iso` or `.bin/.cue`
- It may not make sense to compress already compressed formats such as [`.chd`](https://emulation.gametechwiki.com/index.php/Save_disk_space_for_ISOs#CHD_Compression), [`.cso`](https://emulation.gametechwiki.com/index.php/Save_disk_space_for_ISOs#CSO_.28aka_CISO.29_2), and [`.rvz`](https://emulation.gametechwiki.com/index.php/Save_disk_space_for_ISOs#RVZ_.28Modern_Dolphin_format.29_-_GC.2FWii)

You can exclude files from being zipped with the `--zip-exclude <glob>` option. The "glob" value for this option will be matched against the file's intended _output_ location (as opposed to an _input_ file's location).

You can exclude some disc images like this:

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy zip ^
      --dat "*.dat" ^
      --input "ROMs\" ^
      --output "ROMs-Sorted\" ^
      --zip-exclude "**/*.{iso,bin,cue,chd}"
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy zip \
      --dat "*.dat" \
      --input "ROMs/" \
      --output "ROMs-Sorted/" \
      --zip-exclude "**/*.{iso,bin,cue,chd}"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "*.dat" \
      --input "ROMs/" \
      --output "ROMs-Sorted/" \
      --zip-exclude "**/*.{iso,bin,cue,chd}"
    ```

You can exclude some BIOS files like this:

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy zip ^
      --dat "*.dat" ^
      --input "ROMs\" ^
      --output "ROMs-Sorted\" ^
      --zip-exclude "**/*[BIOS]*"
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy zip \
      --dat "*.dat" \
      --input "ROMs/" \
      --output "ROMs-Sorted/" \
      --zip-exclude "**/*[BIOS]*"
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy zip \
      --dat "*.dat" \
      --input "ROMs/" \
      --output "ROMs-Sorted/" \
      --zip-exclude "**/*[BIOS]*"
    ```

!!! tip

    [globster.xyz](https://globster.xyz/?q=**%2F*.%7Biso%2Cbin%2Ccue%2Cchd%7D&f=dc%2FJet%20Set%20Radio%20(Europe)%20(En%20Fr%20De%20Es).chd%2Cdc%2FSamba%20de%20Amigo%20(USA).chd%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA).m3u%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%201).cue%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%201).bin%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%202).cue%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%202).bin%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%203).cue%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%203).bin%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%204).cue%2Cpsx%2FFinal%20Fantasy%20IX%20(USA)%2FFinal%20Fantasy%20IX%20(USA)%20(Disc%204).bin) is a great website to test various glob patterns.
