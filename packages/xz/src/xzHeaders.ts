/**
 * Ported from XZ Utils v5.8.1, `src/liblzma/common/stream_flags_decoder.c`,
 * `src/liblzma/common/block_header_decoder.c`, `src/liblzma/common/vli_decoder.c`, and
 * `src/liblzma/lzma/lzma2_decoder.c`, following `doc/xz-file-format.txt`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/doc/xz-file-format.txt
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

import zlib from 'node:zlib';

const STREAM_HEADER_MAGIC = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
const STREAM_HEADER_SIZE = 12;
const VLI_BYTES_MAX = 9;
const FILTER_ID_LZMA2 = 0x21;

export interface BlockHeader {
  dictionarySize: number;
  nextOffset: number;
}

/**
 * Validate the 12-byte xz stream header at `offset`, returning the offset after it.
 */
export function readStreamHeader(input: Buffer, offset: number): number {
  if (input.length - offset < STREAM_HEADER_SIZE) {
    throw new Error('xz stream header is truncated');
  }
  if (!input.subarray(offset, offset + STREAM_HEADER_MAGIC.length).equals(STREAM_HEADER_MAGIC)) {
    throw new Error('xz stream header magic is invalid');
  }
  const flags = input.subarray(offset + 6, offset + 8);
  if (zlib.crc32(flags) !== input.readUInt32LE(offset + 8)) {
    throw new Error('xz stream header CRC32 mismatch');
  }
  if (flags[0] !== 0x00 || (flags[1] & 0xf0) !== 0x00) {
    throw new Error('xz stream flags are unsupported');
  }
  return offset + STREAM_HEADER_SIZE;
}

/**
 * Read a variable-length integer, which must end before `end`.
 */
function readVli(
  input: Buffer,
  offset: number,
  end: number,
): { value: number; nextOffset: number } {
  let value = 0;
  for (let i = 0; i < VLI_BYTES_MAX; i += 1) {
    if (offset + i >= end) {
      throw new Error('xz block header is corrupt: a number is truncated');
    }
    const byte = input[offset + i];
    value += (byte & 0x7f) * 2 ** (7 * i);
    if ((byte & 0x80) === 0) {
      if (byte === 0x00 && i > 0) {
        throw new Error('xz block header is corrupt: a number is not minimally encoded');
      }
      return { value, nextOffset: offset + i + 1 };
    }
  }
  throw new Error('xz block header is corrupt: a number is too long');
}

/**
 * Decode the LZMA2 filter's dictionary size property byte.
 */
function lzma2DictionarySize(properties: number): number {
  if ((properties & 0xc0) !== 0 || properties > 40) {
    throw new Error(`xz LZMA2 dictionary size 0x${properties.toString(16)} is invalid`);
  }
  if (properties === 40) {
    return 0xff_ff_ff_ff;
  }
  return (2 | (properties & 1)) * 2 ** ((properties >>> 1) + 11);
}

/**
 * Validate the xz block header at `offset`, which must have exactly one filter, LZMA2.
 */
export function readBlockHeader(input: Buffer, offset: number): BlockHeader {
  if (offset >= input.length) {
    throw new Error('xz block header is truncated');
  }
  if (input[offset] === 0x00) {
    throw new Error('xz stream has no blocks');
  }
  const headerSize = (input[offset] + 1) * 4;
  const headerEnd = offset + headerSize;
  if (headerEnd > input.length) {
    throw new Error('xz block header is truncated');
  }
  const crcOffset = headerEnd - 4;
  if (zlib.crc32(input.subarray(offset, crcOffset)) !== input.readUInt32LE(crcOffset)) {
    throw new Error('xz block header CRC32 mismatch');
  }

  const flags = input[offset + 1];
  if ((flags & 0x3c) !== 0) {
    throw new Error('xz block flags are unsupported');
  }
  const filterCount = (flags & 0x03) + 1;
  if (filterCount !== 1) {
    throw new Error(`xz block has ${filterCount} filters, only one LZMA2 filter is supported`);
  }

  let position = offset + 2;
  if ((flags & 0x40) !== 0) {
    const compressedSize = readVli(input, position, crcOffset);
    if (compressedSize.value === 0) {
      throw new Error('xz block header is corrupt: the compressed size is 0');
    }
    position = compressedSize.nextOffset;
  }
  if ((flags & 0x80) !== 0) {
    position = readVli(input, position, crcOffset).nextOffset;
  }

  const filterId = readVli(input, position, crcOffset);
  if (filterId.value !== FILTER_ID_LZMA2) {
    throw new Error(`xz block filter 0x${filterId.value.toString(16)} isn't supported, only LZMA2`);
  }
  const propertiesSize = readVli(input, filterId.nextOffset, crcOffset);
  if (propertiesSize.value !== 1) {
    throw new Error(`xz LZMA2 filter properties size ${propertiesSize.value} is invalid`);
  }
  position = propertiesSize.nextOffset;
  if (position >= crcOffset) {
    throw new Error('xz block header is truncated');
  }
  const dictionarySize = lzma2DictionarySize(input[position]);
  position += 1;

  for (; position < crcOffset; position += 1) {
    if (input[position] !== 0x00) {
      throw new Error('xz block header padding is nonzero');
    }
  }

  return { dictionarySize, nextOffset: headerEnd };
}
