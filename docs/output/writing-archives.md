# Writing Zip Archives

Igir supports creating `.zip` archives with the `igir zip` [command](../commands.md).

!!! note

    It is intentional that Igir only supports `.zip` archives right now.

    `.zip` archives store CRC32 information in their "central directory" which helps drastically speed up Igir's file scanning, and zip archives are easy to create without proprietary tools (e.g. 7-Zip, Rar).

See the [reading archives](../input/reading-archives.md) page for more information on archive formats and their capabilities.

## TorrentZip

Igir adheres to the [TorrentZip](https://sourceforge.net/projects/trrntzip/) standard for zip files. This standard allows ROM managers to write byte-for-byte identical zip files given the same input files. Some technical details about the standard can be found on [RomVault's wiki](https://wiki.romvault.com/doku.php?id=torrentzip).

TorrentZip is particularly useful with how the MAME community likes to distribute ROMs. Different MAME versions can have different sets of ROMs (which is what requires set ["rebuilding" or "fixing"](../usage/arcade.md#example-re-building-a-rom-set)). A person can take a set of ROMs for an old MAME version, rebuild them for the new MAME version, and then join a BitTorrent tracker and skip downloading the correct files they already have. TorrentZip's deterministic format means zip files themselves will have the same checksum every time.

### RVZSTD

The original TorrentZip format uses the widely supported [DEFLATE](https://en.wikipedia.org/wiki/Deflate) compression algorithm. Gordon J from RomVault has since extended the structured zip format to support [Zstandard ("Zstd")](https://en.wikipedia.org/wiki/Zstd) compression, which can compress files smaller than DEFLATE with less processing power.

Although the zip format officially added support for Zstd compression in [June 2020](https://en.wikipedia.org/wiki/ZIP_(file_format)#Version_history), support among archive programs and OSes remains quite low. Igir uses the old DEFLATE algorithm by default, but you can instead switch to using RVZSTD with the option:

```text
--zip-format rvzstd
```

### Implications for testing

When Igir [tests](../commands.md#test) written zip files, it will test to make sure they're valid a TorrentZip or RVSTD file, whichever was specified. This means that zip files that aren't of the expected structured format will be considered invalid, even if they contain all expected files. This isn't a problem for the `igir zip` command which will rewrite the zip as necessary, but it could be a problem if you have invalid zips in your input paths and omit the command.

The [`--overwrite-invalid` option](options.md#overwriting-files) can help you convert your collection between different zip formats like this:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move zip test ^
      --dat "DATs\" ^
      --input "ROMs\" ^
      --output "ROMs\" ^
      --dir-mirror ^
      --zip-format <format> ^
      --overwrite-invalid
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move zip test \
      --dat "DATs/" \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror \
      --zip-format <format> \
      --overwrite-invalid
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move zip test \
      --dat "DATs/" \
      --input "ROMs/" \
      --output "ROMs/" \
      --dir-mirror \
      --zip-format <format> \
      --overwrite-invalid
    ```

## Example: zipping a ROM collection

One aspect of organizing a ROM collection is to ensure a consistent archive format. You can ensure all ROMs in a collection are in a `.zip` archive like this:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move zip --dat "*.dat" --input "ROMs\" --output "ROMs\"
    ```

=== ":fontawesome-brands-apple: macOS"

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

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip ^
      --dat "*.dat" ^
      --input "ROMs\" ^
      --output "ROMs-Sorted\" ^
      --zip-exclude "**/*.{iso,bin,cue,chd}"
    ```

=== ":fontawesome-brands-apple: macOS"

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

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy zip ^
      --dat "*.dat" ^
      --input "ROMs\" ^
      --output "ROMs-Sorted\" ^
      --zip-exclude "**/*[BIOS]*"
    ```

=== ":fontawesome-brands-apple: macOS"

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
