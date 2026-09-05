#!/usr/bin/env bash
# Regenerate the archive fixtures that `test/index.test.ts` reads.
#
# The output is byte-stable: every payload comes from AES-CTR keystream over
# /dev/zero with a fixed key and IV, so re-running this produces the files that
# are already committed. Nothing in the test suite runs this script -- it exists
# so the fixtures have provenance, and so a new format can be added by editing
# a recipe here rather than by hand.
#
# The `7z/` fixtures predate this script and are left alone. Equivalents can be
# produced with `7zz a -t7z -m0=<method> -mx=<level> <name>.7z 1kb 2kb 3kb 4kb`.
#
# Requires: openssl, compress, bzip2, lzma, split, zip, zstd, python3.

set -euo pipefail

cd "$(dirname "$0")"

# Any fixed pair works; these are arbitrary constants, not secrets.
readonly KEY='00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
readonly IV='000102030405060708090a0b0c0d0e0f'

# Emit $1 bytes of deterministic, incompressible data on stdout.
keystream() {
  head -c "$1" /dev/zero | openssl enc -aes-256-ctr -K "$KEY" -iv "$IV"
}

readonly WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# --- .Z, .bz2, .lzma ---------------------------------------------------------
#
# These three hold a single unnamed stream rather than a directory of entries,
# so they all compress the same 4 KiB payload. The test asserts the extracted
# bytes against one CRC32 constant covering all of them.

keystream 4096 > "$WORK/payload"

mkdir -p z bz2 lzma

# `compress` has no compression levels, only an LZW code width (-b, 9..16).
# 16 is its own default, so the fixture is named for the width instead.
compress -b 16 -c "$WORK/payload" > z/bits16.Z

bzip2 -1 -c "$WORK/payload" > bz2/level1.bz2
bzip2 -9 -c "$WORK/payload" > bz2/level9.bz2

lzma -1 -c --format=lzma "$WORK/payload" > lzma/level1.lzma
lzma -9 -c --format=lzma "$WORK/payload" > lzma/level9.lzma

# --- Split volumes -----------------------------------------------------------
#
# A byte-sliced .7z, read by naming only `copy.7z.001` and the `Split` handler.
# 7-Zip derives `.002` and `.003` from that name and pulls them through the
# addon's IArchiveOpenVolumeCallback, so the caller never enumerates or orders
# slices.
#
# Listing it yields ONE entry -- the slices joined back together, i.e. a
# byte-identical copy of `7z/copy.7z` -- not the four entries inside that
# archive. Reading those means extracting the joined entry and opening it again
# with the `7z` handler.

mkdir -p split
rm -f split/copy.7z.*
split -b 4096 -a 3 -d 7z/copy.7z split/copy.7z.
# `split -d` numbers from 000, but the .001-based naming is the convention every
# 7-Zip tool writes and reads, so shift every slice up by one.
for slice in $(ls -r split/copy.7z.*); do
  printf -v next '%03d' "$((10#${slice##*.} + 1))"
  mv "$slice" "split/copy.7z.$next"
done

# --- Spanned zip -------------------------------------------------------------
#
# A true multi-disk zip from Info-ZIP's `zip -s`, which is NOT the same thing as
# the byte-sliced .7z above: the last disk is named `.zip` and holds the central
# directory, the earlier ones are `.z01`, `.z02`, and the first begins with the
# 4-byte spanning marker PK\x07\x08.
#
# There are two members, and `first.bin` is sized so that it runs past the end of
# the second disk: `second.bin`'s local header therefore begins on a later disk
# and its central-directory record carries a non-zero disk-number-start. A
# single-member archive never exercises that field.
#
# It is nonetheless correct to hand these to CMultiStream in order, because
# `zip -s` slices the one logical archive stream at arbitrary byte boundaries
# rather than restarting each disk -- concatenating the volumes reproduces
# exactly the byte stream the central directory's offsets describe. Verified by
# extracting every entry and comparing against the payload.
#
# `-X` drops the extra fields that carry uid/gid and high-resolution times, and
# the payload's mtime is pinned, so the output is byte-stable like everything
# else here. The split size is 64 KiB because that is the smallest `zip` accepts.

mkdir -p spanned
rm -f spanned/spanned.z[0-9][0-9] spanned/spanned.zip
# One keystream cut in two, so the members differ without a second key.
keystream 180000 > "$WORK/both"
head -c 140000 "$WORK/both" > "$WORK/first.bin"
tail -c +140001 "$WORK/both" > "$WORK/second.bin"
touch -t 202001010000.00 "$WORK/first.bin" "$WORK/second.bin"
(cd "$WORK" && TZ=UTC zip --quiet -X --split-size 64k spanned.zip first.bin second.bin)
mv "$WORK"/spanned.z[0-9][0-9] "$WORK"/spanned.zip spanned/

# --- Zstandard zip -----------------------------------------------------------
#
# Zstd is a decode-only codec here, and reachable only through the Zip handler:
# 7-Zip registers no zstd method for .7z (7zHandlerOut.cpp's zstd block is
# commented out upstream), and the standalone .zst handler is not built into the
# addon. What is built in is ZipHandler.cpp's branch for compression method 93,
# WinZip's Zstandard, plus C/ZstdDec.c and C/Xxh64.c for the frame checksum.
#
# No 7-Zip build can encode zstd, and neither can Info-ZIP or Python's zipfile,
# so the container is assembled byte by byte below and each member's frame comes
# from the `zstd` CLI. The two fixtures differ only in level, which is enough to
# produce materially different frames.

mkdir -p zip
cat > "$WORK/zstd_zip.py" <<'PYTHON'
#!/usr/bin/env python3
"""Write a zip whose members use WinZip's Zstandard method (93).

No 7-Zip build can encode zstd, so the container is assembled here byte by
byte and each member's frame comes from the `zstd` CLI.
"""
import struct, subprocess, sys, zlib

DOS_TIME = 12 << 11                             # 12:00:00
DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 2  # 2026-09-02

def build(out_path, members, level):
    local = b''
    central = b''
    for name, data in members:
        comp = subprocess.run(
            ['zstd', f'-{level}', '-c', '--no-progress'],
            input=data, stdout=subprocess.PIPE, check=True).stdout
        crc = zlib.crc32(data)
        offset = len(local)
        local += struct.pack('<IHHHHHIIIHH', 0x04034b50, 63, 0, 93,
                             DOS_TIME, DOS_DATE, crc, len(comp), len(data),
                             len(name), 0) + name.encode() + comp
        central += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 63, 63, 0, 93,
                               DOS_TIME, DOS_DATE, crc, len(comp), len(data),
                               len(name), 0, 0, 0, 0, 0, offset) + name.encode()
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(members), len(members),
                       len(central), len(local), 0)
    with open(out_path, 'wb') as handle:
        handle.write(local + central + eocd)

# Compressible on purpose, and literal-heavy on purpose: an incompressible
# payload makes zstd emit raw blocks, and a payload of one repeated phrase makes
# it emit one long match. Either would leave the Huffman literal decoder in
# ZstdDec.c untouched. A skewed alphabet driven by a fixed LCG gives 29 distinct
# byte values at non-uniform frequencies, which is what Huffman coding is for,
# and still compresses about 1.7x so the sequence and FSE paths run too.
ALPHABET = bytes(b'e' * 8 + b'ta' * 4 + b'oinshr' * 2 + b'dlcumwfgypbvkjxqz .,')

def payload(size):
    out = bytearray()
    state = 0x1234_5678
    for _ in range(size):
        state = (state * 1_103_515_245 + 12_345) & 0x7fff_ffff
        out.append(ALPHABET[(state >> 16) % len(ALPHABET)])
    return bytes(out)

if __name__ == '__main__':
    out, level = sys.argv[1:3]
    build(out, [(f'{kb}kb', payload(kb * 1024)) for kb in (1, 2, 3, 4)], level)
PYTHON
python3 "$WORK/zstd_zip.py" zip/zstd-level1.zip 1
python3 "$WORK/zstd_zip.py" zip/zstd-level19.zip 19

echo 'CRC32 of the spanned-zip members (first.bin, second.bin):'
head -c 140000 "$WORK/both" | python3 -c 'import sys,zlib;print(format(zlib.crc32(sys.stdin.buffer.read()),"08x"))'
tail -c +140001 "$WORK/both" | python3 -c 'import sys,zlib;print(format(zlib.crc32(sys.stdin.buffer.read()),"08x"))'

echo 'CRC32 of the single-stream payload:'
keystream 4096 | python3 -c 'import sys,zlib;print(format(zlib.crc32(sys.stdin.buffer.read()),"08x"))'
