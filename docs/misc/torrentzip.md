---
search:
  boost: 0.5
---

# TorrentZip Specification

!!! note

    You do not need to understand the technical details of TorrentZip to use Igir. Igir creates TorrentZip archives by default with the [`igir zip` command](../output/writing-archives.md). If you wish to use the more highly compressed but less supported Zstandard algorithm, see the [`--zip-format rvzstd`](../output/writing-archives.md#rvzstd) option.

!!! warning

    The original TorrentZip source code is on [SourceForge](https://sourceforge.net/projects/trrntzip/), but nearly no documentation is provided. A mirror of the README included in published archives (but not available through CVS) is available on [GitHub](https://github.com/tikki/trrntzip/blob/master/README).

    The information contained here is pieced together from the official README, [RomVault's documentation](https://wiki.romvault.com/doku.php?id=torrentzip), Uwe Deportivo's [Go implementation](https://github.com/uwedeportivo/torrentzip), and clean-room reverse engineering the behavior of various other ROM managers. It is not guaranteed to be 100% accurate, and it may require updates over time.

TorrentZip is a set of rules for creating deterministic zip archives. That means that the same input files will produce the exact same zip archive every time, with any tool, on any OS.

## History

From [a mirror](https://github.com/tikki/trrntzip/blob/master/README) of the official README:

> TorrentZip (TZ) is a replacement for MAMEZip. It creates byte-for-byte exact
> zip files on any machine. This allows people to join a torrent (after they
> have converted their zip files with TZ) with a partial romset, thus
> preventing them from having to download the entire set again. Because of the
> way it creates identical zips, the file hashes will always match those in the
> original torrent. It has been written in ANSI and POSIX compliant C such that
> it can be built and run cross-platform (Windows, Linux, OS-X etc) and has
> been tested on 32bit, 64bit, Little-Endian and Big-Endian architectures.

!!! tip

    Igir supports ["rebuilding" or "fixing"](../usage/arcade.md#example-re-building-a-rom-set) MAME sets between different emulator versions. This may cause some incomplete ROM sets, which is one reason a person would join a torrent with existing files.

[SourceForge indicates](https://sourceforge.net/projects/trrntzip/files/trrntzip/) that TorrentZip was created in 2005, and it was released under [GPL v2.0](https://github.com/tikki/trrntzip/blob/master/COPYING).

### RVZSTD

In June 2020, v6.3.7 of the [`APPNOTE.TXT` zip file format specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) added support for Zstandard compression, an algorithm developed by Facebook. Zstandard can compress files more efficiently, and compress & decompress them faster than other Zip-supported compression algorithms such as DEFLATE, BZIP2, LZMA, and PPMd+.

In January 2024, [MAME v0.262](https://www.mamedev.org/releases/whatsnew_0262.txt) added support for Zstandard compression in zip archives and CHD files.

In April 2024, [RomVault v3.7.0](https://wiki.romvault.com/doku.php?id=whats_new#romvault_370) defined a derivative of the TorrentZip specification called "RVZSTD" that uses Zstandard compression instead of DEFLATE. Igir can create RVZSTD archives if specified with the [`--zip-format <format>` option](../output/writing-archives.md).

## Achieving deterministic archives

For TorrentZip archives to be deterministic (compress the same every time), they must follow these rules:

**File order:**

- Files must be sorted by their lowercase filename.

**Filenames:**

- Must use the forward slash (`/`) as the path separator when inside a subdirectory (note that `/` is the only legal path separator in zip files, but it doesn't stop some programs from using `\` anyway).
- Filenames that can't be [CP437](https://en.wikipedia.org/wiki/Code_page_437)-encoded should be [UTF-8](https://en.wikipedia.org/wiki/UTF-8)-encoded and have the associated general purpose bit flag 11 set in both the local file header and central directory file header.

**File properties:**

- The last modified timestamp for files must all be set to a fixed value (described below), which differs between TorrentZip and RVZSTD.

**Directories:**

- Directory entries are permitted (entries with a `/` at the end of the filename, an uncompressed size of 0, and an uncompressed CRC-32 of `00000000`), but should only be included when its existence can't be inferred from another file entry.

  For example, `b/` is a legal directory entry here because it has no files inside of it:

  ```text
  a/a1.rom
  b/
  ```

  but `a/` is not a legal directory here as its existence can be inferred from the file `a/a1.rom`:

  ```text
  a/
  a/a1.rom
  ```

**File data compression:**

Files must be compressed with an exact library version and settings. Changes to either of these may produce differences in compressed files.

TorrentZip:

- DEFLATE compression with zlib v1.1.3 (July 9, 1998)
- Compression level 9 (`Z_BEST_COMPRESSION`)
- Window size of -15 (`-MAX_WBITS`), which omits the header and trailing checksum

RVZSTD:

- Zstandard v1.5.5 (April 2023)
  - Compiled with `-DZSTD_MULTITHREAD`
- Compression level 19 (`ZSTD_CLEVEL_MAX`), which has the compression parameters:
  - `ZSTD_c_windowLog`: 23 (2^23 bytes == 8 MiB)
  - `ZSTD_c_chainLog`: 24 (2^24 == 16,777,216 entries)
  - `ZSTD_c_hashLog`: 22 (2^22 == 4,194,304 entries)
  - `ZSTD_c_searchLog`: 7 (2^7 == 128 comparisons)
  - `ZSTD_c_minMatch`: 3 (bytes)
  - `ZSTD_c_targetLength`: 256 (bytes)
  - `ZSTD_c_strategy`: `ZSTD_btultra2`
- Using streaming compression (`ZSTD_compressStream2()`), with `ZSTD_c_nbWorkers` >0
  - _Except_ if the uncompressed file is empty (is of size 0), in which case `ZSTD_compress()` should be used (no streaming and no workers/threads)
- With no other options set (the defaults are used), such as:
  - Long-distance matching (`ZSTD_c_enableLongDistanceMatching` default OFF, `ZSTD_c_ldm*` options)
  - Frame checksums (`ZSTD_c_checksumFlag` default OFF)
  - Multi-threading options (`ZSTD_c_jobSize`, `ZSTD_c_overlapLog`)

**Archive comment:**

TorrentZip archives make use of a checksum in the archive comment to quickly verify the validity of the file. It is fast to read this checksum because the archive comment is always the last data in a zip archive.

The checksum is calculated by taking the CRC-32 of the full bytes of every central directory file header, concatenated together in the order they appear in the archive (in other words, all the bytes between the "start of central directory" and "end of central directory"). This means that any change to a file's name, size, checksum, or other properties will change the archive checksum.

This checksum is then converted to hexadecimal uppercase, with the start padded to a length of 8 with the character `0`. The comment is then prefixed with a string depending on the format:

- TorrentZip: `TORRENTZIPPED-ABCD1234` (always a length of 22 characters/bytes)
- RVZSTD: `RVZSTD-0987FEDC` (always a length of 15 characters/bytes)

The comment is written as-is (does not have its byte order reversed) even though numeric values are all written in little-endian byte order.

## Zip features used

TorrentZip archives are valid zip files that adhere to [PKWARE's `APPNOTE.TXT` zip file format specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT). This includes using little-endian (reverse) byte order.

TorrentZip makes use of these zip features:

- UTF-8 filename encoding via the general purpose bit flag 11 when necessary
- Zip64 extended information extra fields, an end of central directory record, and an end of central directory record locator when necessary

TorrentZip does not use these less common features:

- Encryption of any kind, including:
  - Local file encryption headers
  - Archive decryption header
  - General purpose bit flag 6 for strong encryption
  - General purpose bit flag 13 for local file value masking
- Extensible data fields other than Zip64 (0x0001)
- Local file data descriptors
  - Therefore, the general purpose bit flag 3 is also not used
- Archive extra data record

## File layout

Here is a visual representation of a TorrentZip archive, with details about every zip feature & field used. The descriptions used match the [`APPNOTE.TXT` zip file format specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) language.

```text
+----------------------------------------------------------------------------------------------------------+
|                                                                                                          |
|                                            Local file headers                                            |
|                                                                                                          |
+------------+----------------------------+---------+---------+-------------------------+------------------+
| Local      |         Description        |  Offset |   Size  |        TorrentZip       |      RVZSTD      |
| file       |                            | (bytes) | (bytes) |                         |                  |
| header 1   +----------------------------+---------+---------+-------------------------+------------------+
|            | Local file header          | 0       | 4       | 0x04034b50 ("PK♥♦")                        |
|            | signature                  |         |         |                                            |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Version needed             | 4       | 2       | 45 if a Zip64 extra     | 63               |
|            | to extract                 |         |         | data record is          |                  |
|            |                            |         |         | required, otherwise 20  |                  |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | General purpose bit flag   | 6       | 2       | 0x02 (max compression) if the file name    |
|            |                            |         |         | is CP437-encodable; 0x02|0x800=0x802 if    |
|            |                            |         |         | the file name requires UTF-8 encoding      |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Compression method         | 8       | 2       | 8 (for DEFLATE)         | 93 (for Zstd)    |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Last mod file time         | 10      | 2       | 48128 (11:32:00 PM)     | 0 (00:00:00 AM)  |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Last mod file date         | 12      | 2       | 8600 (Dec 24, 1996)     | 0 (Jan 1, 1980)  |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | CRC-32                     | 14      | 4       | The uncompressed file's CRC-32 checksum    |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Compressed size            | 18      | 4       | 0xFFFFFFFF if the compressed OR            |
|            |                            |         |         | uncompressed size >=0xFFFFFFFF,            |
|            |                            |         |         | otherwise the compressed size              |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Uncompressed size          | 22      | 4       | 0xFFFFFFFF if the compressed OR            |
|            |                            |         |         | uncompressed size >=0xFFFFFFFF,            |
|            |                            |         |         | otherwise the uncompressed size            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | File name length (n)       | 26      | 2       | The length in bytes of the                 |
|            |                            |         |         | encoded filename                           |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Extra field length (m)     | 28      | 2       | 0 if the uncompressed size is              |
|            |                            |         |         | <0xFFFFFFFF, otherwise 20 bytes            |
|            |                            |         |         | +8 more bytes if this local file           |
|            |                            |         |         | header's byte offset is >=0xFFFFFFFF       |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | File name                  | 30      | n       | The CP437 or UTF-8 encoded filename        |
|            +----------+-----------------+---------+---------+--------------------------------------------+
|            | Extra    | Extra data      | 30+n    | 2       | 0x0001 (Zip64 extended information         |
|            | field    | record 1:       |         |         | extra field)                               |
|            | (present | header ID       |         |         |                                            |
|            | if extra +-----------------+---------+---------+--------------------------------------------+
|            | field    | Extra data      | 30+n+2  | 2       | (same as the extra field length above      |
|            | length   | record 1:       |         |         | -4 bytes for the header ID & data          |
|            | >0)      | record size     |         |         | size fields)                               |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64:          | 30+n+4  | 8       | The uncompressed file's size               |
|            |          | uncompressed    |         |         | (always present)                           |
|            |          | file size       |         |         |                                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: size of  | 30+n+12 | 8       | The compressed file's size                 |
|            |          | compressed data |         |         | (always present)                           |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: offset   | 30+n+20 | 0 or 8  | Present if this local file header's byte   |
|            |          | of local header |         |         | offset is >=0xFFFFFFFF, otherwise omitted  |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: number   | 30+n+28 | 0       | (not used / omitted)                       |
|            |          | of the disk on  |         |         |                                            |
|            |          | which this      |         |         |                                            |
|            |          | file starts     |         |         |                                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | (no other extra data records are used)                                           |
+------------+----------+---------------------------+---------+--------------------------------------------+
| Encryption header 1                               | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+-------------------------+------------------+
| File data 1                                       | *       | File's contents         | File's contents  |
|                                                   |         | compressed by zlib      | compressed by    |
|                                                   |         | v1.1.3 (Jul 9, 1998)    | zstd v1.5.5      |
|                                                   |         | at compression          | (Apr 2023)       |
|                                                   |         | level 9 (max)           | at compression   |
|                                                   |         |                         | level 19         |
+---------------------------------------------------+---------+-------------------------+------------------+
| Data descriptor 1                                 | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+--------------------------------------------+
| Local file header 2                               | *       | (same format as above)                     |
+---------------------------------------------------+---------+--------------------------------------------+
| File data 2                                       | *       | (same compression methodology as above)    |
+---------------------------------------------------+---------+--------------------------------------------+
| Data descriptor 2                                 | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+--------------------------------------------+
| ...                                                                                                      |
+---------------------------------------------------+---------+--------------------------------------------+
| Local file header N                               | *       | (same format as above)                     |
+---------------------------------------------------+---------+--------------------------------------------+
| File data N                                       | *       | (same compression methodology as above)    |
+---------------------------------------------------+---------+--------------------------------------------+
| Data descriptor N                                 | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+--------------------------------------------+
| Archive decryption header                         | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+--------------------------------------------+
| Archive extra data record                         | 0       | (not used / omitted)                       |
+---------------------------------------------------+---------+--------------------------------------------+
|                                                                                                          |
|                                    Start of central directory ("SOCD")                                   |
|                                                                                                          |
+------------+----------------------------+---------+---------+-------------------------+------------------+
| Central    |         Description        |  Offset |   Size  |        TorrentZip       |      RVZSTD      |
| directory  |                            | (bytes) | (bytes) |                         |                  |
| file       +----------------------------+---------+---------+-------------------------+------------------+
| header     | Central file               | 0       | 4       | 0x02014b50 ("PK☺︎☻")                        |
| ("CDFH") 1 | header signature           |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Version made by            | 4       | 2       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Version needed to extract  | 6       | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | General purpose bit flag   | 8       | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Compression method         | 10      | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Last mod file time         | 12      | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Last mod file date         | 14      | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | CRC-32                     | 16      | 4       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Compressed size            | 20      | 4       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Uncompressed size          | 24      | 4       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | File name length (n)       | 28      | 2       | (same as local file header)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Extra field length (m)     | 30      | 2       | 0 if the uncompressed size, compressed     |
|            |                            |         |         | size, and local file header byte offset    |
|            |                            |         |         | are all <0xFFFFFFFF; otherwise 4 +8 bytes  |
|            |                            |         |         | for each field that is >=0xFFFFFFFF        |
|            |                            |         |         | (for a maximum of 28 bytes)                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | File comment length (k)    | 32      | 2       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Disk number start          | 34      | 2       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Internal file attributes   | 36      | 2       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | External file attributes   | 38      | 4       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Relative offset of         | 42      | 4       | min(the local file header's byte offset,   |
|            | local header               |         |         | 0xFFFFFFFF)                                |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | File name                  | 46      | n       | (same as local file header)                |
|            +----------+-----------------+---------+---------+--------------------------------------------+
|            | Extra    | Extra data      | 46+n    | 2       | 0x0001 (Zip64 extended information         |
|            | field    | record 1:       |         |         | extra field)                               |
|            | (present | header ID       |         |         |                                            |
|            | if extra +-----------------+---------+---------+--------------------------------------------+
|            | field    | Extra data      | 46+n+2  | 2       | (same as the extra field length above      |
|            | length   | record 1:       |         |         | -4 bytes for the header ID & data          |
|            | >0)      | size            |         |         | size fields)                               |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64:          | 46+n+10 | 0 or 8  | Present if uncompressed size               |
|            |          | uncompressed    |         |         | is >=0xFFFFFFFF                            |
|            |          | file size       |         |         |                                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: size of  | *       | 0 or 8  | Present if compressed size                 |
|            |          | compressed data |         |         | is >=0xFFFFFFFF                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: offset   | *       | 0 or 8  | Present if the local file header's         |
|            |          | of local        |         |         | byte offset is >=0xFFFFFFFF                |
|            |          | header          |         |         |                                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | Zip64: number   | *       | 0       | (not used / omitted)                       |
|            |          | of the disk on  |         |         |                                            |
|            |          | which this      |         |         |                                            |
|            |          | file starts     |         |         |                                            |
|            |          +-----------------+---------+---------+--------------------------------------------+
|            |          | (no other extra data records are used)                                           |
|            +----------+-----------------+---------+---------+--------------------------------------------+
|            | File comment               | 46+n+m  | k (0)   | (not used / omitted)                       |
+------------+----------------------------+---------+---------+--------------------------------------------+
| Central directory file header 2                   | *       | (same format as above)                     |
+---------------------------------------------------+---------+--------------------------------------------+
| ...                                                                                                      |
+---------------------------------------------------+---------+--------------------------------------------+
| Central directory file header N                   | *       | (same format as above)                     |
+---------------------------------------------------+---------+--------------------------------------------+
|                                                                                                          |
|                                     End of central directory ("EOCD")                                    |
|                                                                                                          |
+------------+----------------------------+---------+---------+-------------------------+------------------+
| Zip64 end  |         Description        |  Offset |   Size  |        TorrentZip       |      RVZSTD      |
| of central |                            | (bytes) | (bytes) |                         |                  |
| directory  +----------------------------+---------+---------+-------------------------+------------------+
| record     | Zip64 end of central       | 0       | 4       | 0x06064b50 ("PK♠︎♠︎")                        |
| ("EOCD64") | dir signature              |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
| Present if | Size of Zip64 end of       | 4       | 8       | 44                                         |
| any true:  | central directory          |         |         |                                            |
|            | record                     |         |         |                                            |
| - Length   +----------------------------+---------+---------+--------------------------------------------+
|   of all   | Version made by            | 12      | 2       | 45                                         |
|   CDFH     +----------------------------+---------+---------+--------------------------------------------+
|   together | Version needed to extract  | 14      | 2       | 45                                         |
|   >=       +----------------------------+---------+---------+--------------------------------------------+
| 0xFFFFFFFF | Number of this disk        | 16      | 4       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
| - SOCD     | Number of the disk         | 20      | 4       | 0                                          |
|   offset   | with the start of          |         |         |                                            |
|   >=       | the central directory      |         |         |                                            |
| 0xFFFFFFFF +----------------------------+---------+---------+--------------------------------------------+
|            | Total number of entries    | 24      | 8       | The number of files in the archive         |
| - Local    | in the central directory   |         |         |                                            |
|   file     | on this disk               |         |         |                                            |
|   headers  +----------------------------+---------+---------+--------------------------------------------+
|   count    | Total number of entries    | 32      | 8       | The number of files in the archive         |
|   >=0xFFFF | in the central directory   |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Size of the                | 40      | 8       | The sum of every central file directory    |
|            | central directory          |         |         | header's length                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Offset of start of         | 48      | 8       | The byte offset to the start of the        |
|            | central directory          |         |         | central directory (the first central       |
|            | with respect to            |         |         | directory file header)                     |
|            | the starting disk number   |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Zip64 extensible           | 56      | *       | (not used / omitted)                       |
|            | data sector                |         |         |                                            |
+------------+----------------------------+---------+---------+-------------------------+------------------+
| Zip64 end  |         Description        |  Offset |   Size  |        TorrentZip       |      RVZSTD      |
| of central |                            | (bytes) | (bytes) |                         |                  |
| directory  +----------------------------+---------+---------+-------------------------+------------------+
| locator    | Zip64 end of central dir   | 0       | 4       | 0x07064b50 ("PK♠︎•")                        |
| (present   | locator signature          |         |         |                                            |
| if Zip64   +----------------------------+---------+---------+--------------------------------------------+
| EOCD is    | Number of the disk with    | 4       | 4       | 0                                          |
| present)   | the start of the Zip64     |         |         |                                            |
|            | end of central             |         |         |                                            |
|            | directory                  |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Relative offset of the     | 8       | 8       | The byte offset to the Zip64 end of        |
|            | Zip64 end of central       |         |         | central directory                          |
|            | directory record           |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Total number of disks      | 16      | 4       | 1                                          |
+------------+----------------------------+---------+---------+-------------------------+------------------+
| End of     |         Description        |  Offset |   Size  |        TorrentZip       |      RVZSTD      |
| central    |                            | (bytes) | (bytes) |                         |                  |
| directory  +----------------------------+---------+---------+-------------------------+------------------+
| record     | End of central dir         | 0       | 4       | 0x06054b50 ("PK♣︎♠︎")                        |
|            | signature                  |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Number of this disk        | 4       | 2       | 0                                          |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Number of the disk with    | 6       | 2       | 0                                          |
|            | the start of the           |         |         |                                            |
|            | central directory          |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Total number of entries    | 8       | 2       | min(the number of files in the archive,    |
|            | in the central directory   |         |         | 0xFFFF)                                    |
|            | on this disk               |         |         |                                            |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Total number of entries    | 10      | 2       | min(the number of files in the archive,    |
|            | in the central directory   |         |         | 0xFFFF)                                    |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Size of the                | 12      | 4       | min(the sum of every central file          |
|            | central directory          |         |         | directory header's length, 0xFFFFFFFF)     |
|            +----------------------------+---------+---------+--------------------------------------------+
|            | Offset of start of         | 16      | 4       | min(the byte offset to the start of the    |
|            | central directory          |         |         | central directory, 0xFFFFFFFF)             |
|            | with respect to            |         |         |                                            |
|            | the starting disk number   |         |         |                                            |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Zip file comment           | 20      | 2       | 22                      | 15               |
|            | length (n)                 |         |         |                         |                  |
|            +----------------------------+---------+---------+-------------------------+------------------+
|            | Zip file comment           | 22      | n       | "TORRENTZIPPED-{CRC32}" | "RVZSTD-{CRC32}" |
+------------+----------------------------+---------+---------+-------------------------+------------------+
```
