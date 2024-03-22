# ROM Matching

When `igir` [scans ROM files](../input/file-scanning.md) in the input directory, it calculates a number of checksums to uniquely identify each file. These checksums are then matched to ones found in [DATs](../dats/introduction.md).

By default, `igir` will use CRC32 + filesize to match input files to ROMs found in DATs. CRC32 checksums are fast to calculate, and many [archive formats](../input/reading-archives.md) include them in their directory of files, which greatly speeds up scanning.

!!! note

    The main drawback of CRC32 checksums are their small keyspace of 4.29 billion unique values (see below). This might seem like a lot, but it's sufficiently small enough that it is very possible for two different files to have the same CRC32. Chances of these "collisions" can be reduced by also comparing the filesize of the two different files.

## Automatically using other checksum algorithms

Some DAT release groups do not include every checksum for every file. For example, MAME CHDs only include SHA1 checksums and nothing else, not even filesize information.

And some DAT release groups do not include filesize information for every file, preventing a safe use of CRC32. For example, not every [Hardware Target Game Database SMDB](https://github.com/frederic-mahe/Hardware-Target-Game-Database/tree/master/EverDrive%20Pack%20SMDBs) includes file sizes, but they typically include all the normal checksums.

!!! success

    For situations like these, `igir` will automatically detect what combination of checksums it needs to calculate for input files to be able to match them to DATs. This has the chance of greatly slowing down file scanning, especially with archives.

For example, if you provide all of these DATs at once with the [`--dat <path>` option](../dats/processing.md):

- No-Intro's Nintendo Game Boy DAT (which includes filesize, CRC32, MD5, and SHA1 information)
- Hardware Target Game Database's Atari Lynx SMBD (which includes CRC32, MD5, SHA1, and SHA256 information but _not_ filesize)
- MAME ListXML (which only includes SHA1 information for CHD "disks")

...then `igir` will determine that SHA1 is necessary to calculate because not every ROM in every DAT includes CRC32 _and_ filesize information.

!!! note

    When generating a [dir2dat](../dats/dir2dat.md) with the `igir dir2dat` command, `igir` will calculate CRC32, MD5, and SHA1 information for every file. This helps ensure that the generated DAT has the most complete information it can. You can additionally add SHA256 information with the option `igir [commands..] [options] --input-min-checksum SHA256` (below).

## Manually using other checksum algorithms

!!! danger

    Most people do not need to calculate checksums above CRC32. CRC32 + filesize is sufficient to match ROMs and test written files in the gross majority of cases. The below information is for people that _truly_ know they need higher checksums.

You can specify higher checksum algorithms with the `--input-min-checksum <algorithm>` option like this:

```shell
igir [commands..] [options] --input-min-checksum MD5
igir [commands..] [options] --input-min-checksum SHA1
igir [commands..] [options] --input-min-checksum SHA256
```

This option defines the _minimum_ checksum that will be used based on digest size (below).  If not every ROM in every DAT provides the checksum you specify, `igir` may automatically calculate and match files based on a higher checksum (see above).

The reason you might want to do this is to have a higher confidence that found files _exactly_ match ROMs in DATs. Just keep in mind that explicitly enabling non-CRC32 checksums will _greatly_ slow down scanning of files within archives.

Here is a table that shows the keyspace for each checksum algorithm, where the higher number of bits reduces the chances of collisions:

| Algorithm | Digest size | Unique values                       | Example value                                                      |
|-----------|-------------|-------------------------------------|--------------------------------------------------------------------|
| CRC32     | 32 bits     | 2^32 = 4.29 billion                 | `30a184a7`                                                         |
| MD5       | 128 bits    | 2^128 = 340.28 undecillion          | `52bb8f12b27cebd672b1fd8a06145b1c`                                 |
| SHA1      | 160 bits    | 2^160 = 1.46 quindecillion          | `666d29a15d92f62750dd665a06ce01fbd09eb98a`                         |
| SHA256    | 256 bits    | 2^256 = 115.79 quattuorvigintillion | `1934e26cf69aa49978baac893ad5a890af35bdfb2c7a9393745f14dc89459137` |

When files are [tested](../commands.md#test) after being written, `igir` will use the highest checksum available from the scanned file to check the written file. This lets you have equal confidence that a file was written correctly as well as matched correctly.
