import zlib from 'node:zlib';

import { readBlockHeader, readStreamHeader } from '../src/xzHeaders.js';

function streamHeader(flagsHex: string): Buffer {
  const flags = Buffer.from(flagsHex, 'hex');
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(zlib.crc32(flags));
  return Buffer.concat([Buffer.from('fd377a585a00', 'hex'), flags, crc]);
}

/** A block header with the given bytes after its size byte, padded, with a correct CRC32 */
function blockHeader(fields: number[]): Buffer {
  const size = Math.ceil((1 + fields.length + 4) / 4) * 4;
  const header = Buffer.alloc(size);
  header[0] = size / 4 - 1;
  Buffer.from(fields).copy(header, 1);
  header.writeUInt32LE(zlib.crc32(header.subarray(0, size - 4)), size - 4);
  return header;
}

describe('readStreamHeader', () => {
  it('should return the offset after a valid header', () => {
    expect(readStreamHeader(Buffer.from('fd377a585a000000ff12d941', 'hex'), 0)).toEqual(12);
  });

  it('should read a header after an offset', () => {
    expect(readStreamHeader(Buffer.concat([Buffer.alloc(2), streamHeader('0000')]), 2)).toEqual(14);
  });

  it('should accept any check type', () => {
    expect(readStreamHeader(streamHeader('000a'), 0)).toEqual(12);
  });

  test.each([
    ['a truncated header', Buffer.from('fd377a', 'hex'), 'xz stream header is truncated'],
    [
      'bad magic',
      Buffer.from('fe377a585a000000ff12d941', 'hex'),
      'xz stream header magic is invalid',
    ],
    [
      'a CRC32 mismatch',
      Buffer.from('fd377a585a000001ff12d941', 'hex'),
      'xz stream header CRC32 mismatch',
    ],
    ['reserved flags', streamHeader('0100'), 'xz stream flags are unsupported'],
  ])('should throw on %s', (_name, input, expectedError) => {
    expect(() => readStreamHeader(input, 0)).toThrow(expectedError);
  });
});

describe('readBlockHeader', () => {
  test.each([
    // xdelta3's header: no sizes, LZMA2, an 8 MiB dictionary
    ['xdelta3', Buffer.from('0200210116000000742fe5a3', 'hex'), 8 * 1024 * 1024, 12],
    [
      'compressed and uncompressed sizes',
      blockHeader([0xc0, 0x10, 0x20, 0x21, 0x01, 0x16]),
      8 * 1024 * 1024,
      12,
    ],
    ['the smallest dictionary', blockHeader([0x00, 0x21, 0x01, 0x00]), 4096, 12],
    ['an odd dictionary size', blockHeader([0x00, 0x21, 0x01, 0x01]), 6144, 12],
    ['the largest dictionary', blockHeader([0x00, 0x21, 0x01, 0x28]), 0xff_ff_ff_ff, 12],
  ])('should read %s', (_name, input, dictionarySize, nextOffset) => {
    expect(readBlockHeader(input, 0)).toEqual({ dictionarySize, nextOffset });
  });

  it('should read a header after an offset', () => {
    const input = Buffer.concat([Buffer.alloc(3), blockHeader([0x00, 0x21, 0x01, 0x16])]);
    expect(readBlockHeader(input, 3)).toEqual({ dictionarySize: 8 * 1024 * 1024, nextOffset: 15 });
  });

  const corruptCrc = blockHeader([0x00, 0x21, 0x01, 0x16]);
  corruptCrc[11] ^= 0xff;

  test.each([
    ['no input', Buffer.alloc(0), 'xz block header is truncated'],
    ['an index instead of a block', Buffer.from('00', 'hex'), 'xz stream has no blocks'],
    ['a header past the input', Buffer.from('02002101', 'hex'), 'xz block header is truncated'],
    ['a CRC32 mismatch', corruptCrc, 'xz block header CRC32 mismatch'],
    ['reserved flags', blockHeader([0x04, 0x21, 0x01, 0x16]), 'xz block flags are unsupported'],
    [
      'two filters',
      blockHeader([0x01, 0x03, 0x01, 0x00, 0x21, 0x01, 0x16]),
      'xz block has 2 filters, only one LZMA2 filter is supported',
    ],
    [
      'a non-LZMA2 filter',
      blockHeader([0x00, 0x03, 0x01, 0x00]),
      "xz block filter 0x3 isn't supported, only LZMA2",
    ],
    [
      'LZMA2 properties of 2 bytes',
      blockHeader([0x00, 0x21, 0x02, 0x16, 0x00]),
      'xz LZMA2 filter properties size 2 is invalid',
    ],
    [
      'an invalid dictionary size',
      blockHeader([0x00, 0x21, 0x01, 0x29]),
      'xz LZMA2 dictionary size 0x29 is invalid',
    ],
    [
      'nonzero padding',
      blockHeader([0x00, 0x21, 0x01, 0x16, 0x01]),
      'xz block header padding is nonzero',
    ],
    [
      'a compressed size of 0',
      blockHeader([0x40, 0x00, 0x21, 0x01, 0x16]),
      'the compressed size is 0',
    ],
    [
      'a number that is not minimally encoded',
      blockHeader([0x40, 0x81, 0x00, 0x21, 0x01, 0x16]),
      'a number is not minimally encoded',
    ],
  ])('should throw on %s', (_name, input, expectedError) => {
    expect(() => readBlockHeader(input, 0)).toThrow(expectedError);
  });
});
