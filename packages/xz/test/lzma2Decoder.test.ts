import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import Lzma2Decoder from '../src/lzma2Decoder.js';
import { FIXTURES } from './fixtures/fixtures.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

function decodeHex(lzma2Decoder: Lzma2Decoder, inputHex: string, outputSize: number): Buffer {
  const input = Buffer.from(inputHex.replaceAll(' ', ''), 'hex');
  const output = Buffer.alloc(outputSize);
  lzma2Decoder.decode(input, 0, input.length, output);
  return output;
}

describe('decode', () => {
  it('should decode uncompressed chunks with and without a dictionary reset', () => {
    expect(decodeHex(new Lzma2Decoder(4096), '01 0002 616263 02 0001 6465', 5)).toEqual(
      Buffer.from('abcde'),
    );
  });

  it('should continue from the previous call', () => {
    const lzma2Decoder = new Lzma2Decoder(4096);
    expect(decodeHex(lzma2Decoder, '01 0002 616263', 3)).toEqual(Buffer.from('abc'));
    expect(decodeHex(lzma2Decoder, '02 0000 64', 1)).toEqual(Buffer.from('d'));
  });

  test.each([
    ['an end marker', '00', 1, 'LZMA2 end of data is unsupported'],
    [
      'a first chunk without a dictionary reset',
      '02 0000 61',
      1,
      'the first LZMA2 chunk must reset the dictionary',
    ],
    ['an invalid control byte', '01 0000 61 03', 2, 'the LZMA2 control byte 0x3 is invalid'],
    [
      'an LZMA chunk before any properties',
      '01 0000 61 80 0000 0004 0000000000',
      2,
      'an LZMA2 chunk needs new properties',
    ],
    [
      'an invalid properties byte',
      `e0 0000 000a e1 ${'00'.repeat(11)}`,
      1,
      'the LZMA properties byte 0xe1 is invalid',
    ],
    ['lc plus lp over 4', `e0 0000 000a 0d ${'00'.repeat(11)}`, 1, 'lc=4 plus lp=1 is more than 4'],
    [
      "a range decoder whose first byte isn't 0x00",
      'e0 0000 0004 5d 0100000000',
      1,
      "the range decoder's first byte isn't 0x00",
    ],
    // With every probability at 0x400, a code of 0xC0000000 decodes isMatch = 1 and isRep = 1
    [
      'a repeated match before any data',
      'e0 0000 0004 5d 00c0000000',
      1,
      'LZMA data is corrupt: a repeated match is before any data',
    ],
    ['a truncated chunk header', 'e0 0000', 3, /partway through an LZMA2 chunk header$/],
    ['a truncated chunk', '01 0002 6162', 3, /partway through an LZMA2 chunk$/],
    ['too much output', '01 0002 616263', 2, 'xz decoder produced 3 bytes, expected 2'],
    ['unused input', '01 0002 616263 02 0000 64', 3, 'xz decoder left 4 bytes of input unused'],
  ])('should throw on %s', (_name, inputHex, outputSize, expectedError) => {
    expect(() => decodeHex(new Lzma2Decoder(4096), inputHex, outputSize)).toThrow(expectedError);
  });

  it('should throw on a match distance beyond the dictionary', async () => {
    // distantMatch.xz is one LZMA chunk with a match 8 KiB back, which a 4 KiB dictionary can't
    // reach
    const xz = await fs.promises.readFile(path.join(dirname, 'fixtures', 'distantMatch.xz'));
    const chunkOffset = 12 + (xz[12] + 1) * 4;
    const chunkEnd = chunkOffset + 6 + xz.readUInt16BE(chunkOffset + 3) + 1;
    const output = Buffer.alloc(FIXTURES['distantMatch.xz'].input().length);
    expect(() => {
      new Lzma2Decoder(4096).decode(xz, chunkOffset, chunkEnd, output);
    }).toThrow('LZMA data is corrupt: a match distance is beyond the dictionary');
  });
});

describe('getOutputPosition', () => {
  it('should count the bytes the last call produced', () => {
    const lzma2Decoder = new Lzma2Decoder(4096);
    decodeHex(lzma2Decoder, '01 0002 616263', 5);
    expect(lzma2Decoder.getOutputPosition()).toEqual(3);
  });
});
