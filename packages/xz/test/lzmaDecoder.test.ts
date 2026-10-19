import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import LzDictionary from '../src/lzDictionary.js';
import LzmaDecoder from '../src/lzmaDecoder.js';
import { FIXTURES } from './fixtures/fixtures.js';

// smallDictionary.xz is one LZMA2 chunk with a full reset, so its LZMA data stands alone
const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const xz = await fs.promises.readFile(path.join(dirname, 'fixtures', 'smallDictionary.xz'));
const expected = FIXTURES['smallDictionary.xz'].input();
const chunkOffset = 12 + (xz[12] + 1) * 4;
const uncompressedSize =
  (xz[chunkOffset] & 0x1f) * 0x1_00_00 + xz.readUInt16BE(chunkOffset + 1) + 1;
const dataStart = chunkOffset + 6;
const dataEnd = dataStart + xz.readUInt16BE(chunkOffset + 3) + 1;
const DICTIONARY_SIZE = 4096;

function decodeChunk(lzmaDecoder: LzmaDecoder, dictionary: LzDictionary, input = xz): Buffer {
  const output = Buffer.alloc(uncompressedSize);
  dictionary.setOutput(output);
  lzmaDecoder.decodeChunk(input, dataStart, dataEnd, uncompressedSize, dictionary);
  return output;
}

function lzmaDecoderOf(): LzmaDecoder {
  const lzmaDecoder = new LzmaDecoder();
  // Properties byte 0x5D: lc=3, lp=0, pb=2
  lzmaDecoder.setProperties(3, 0, 2);
  return lzmaDecoder;
}

describe('setProperties', () => {
  it("should match the fixture's properties byte", () => {
    expect(xz[chunkOffset + 5]).toEqual(0x5d);
  });

  it('should reset the state', () => {
    const lzmaDecoder = lzmaDecoderOf();
    const dictionary = new LzDictionary(DICTIONARY_SIZE);
    decodeChunk(lzmaDecoder, dictionary);
    dictionary.reset();
    lzmaDecoder.setProperties(3, 0, 2);
    expect(decodeChunk(lzmaDecoder, dictionary)).toEqual(expected);
  });
});

describe('resetState', () => {
  it('should reset the state', () => {
    const lzmaDecoder = lzmaDecoderOf();
    const dictionary = new LzDictionary(DICTIONARY_SIZE);
    decodeChunk(lzmaDecoder, dictionary);
    dictionary.reset();
    lzmaDecoder.resetState();
    expect(decodeChunk(lzmaDecoder, dictionary)).toEqual(expected);
  });
});

describe('decodeChunk', () => {
  it('should decode an LZMA chunk whose matches wrap around the dictionary', () => {
    expect(decodeChunk(lzmaDecoderOf(), new LzDictionary(DICTIONARY_SIZE))).toEqual(expected);
  });

  it('should throw on corrupt data', () => {
    const corrupt = Buffer.from(xz);
    corrupt[dataStart + 1000] ^= 0xff;
    expect(() => decodeChunk(lzmaDecoderOf(), new LzDictionary(DICTIONARY_SIZE), corrupt)).toThrow(
      /LZMA data is corrupt/,
    );
  });
});
