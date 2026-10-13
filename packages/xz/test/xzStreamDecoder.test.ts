import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import XzStreamDecoder from '../src/xzStreamDecoder.js';
import { FIXTURES } from './fixtures/fixtures.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

// xdelta3's stream header and block header: no check, LZMA2, an 8 MiB dictionary
const HEADERS = Buffer.from('fd377a585a000000ff12d9410200210116000000742fe5a3', 'hex');

interface Chunk {
  start: number;
  dataStart: number;
  end: number;
  uncompressedSize: number;
}

/**
 * Walk the LZMA2 chunks after the stream and block headers, stopping at the end marker.
 */
function chunks(xz: Buffer): Chunk[] {
  const result: Chunk[] = [];
  let offset = 12 + (xz[12] + 1) * 4;
  while (xz[offset] !== 0x00) {
    const control = xz[offset];
    if (control <= 0x02) {
      const size = xz.readUInt16BE(offset + 1) + 1;
      result.push({
        start: offset,
        dataStart: offset + 3,
        end: offset + 3 + size,
        uncompressedSize: size,
      });
    } else {
      const dataStart = offset + (control >= 0xc0 ? 6 : 5);
      result.push({
        start: offset,
        dataStart,
        end: dataStart + xz.readUInt16BE(offset + 3) + 1,
        uncompressedSize: (control & 0x1f) * 0x1_00_00 + xz.readUInt16BE(offset + 1) + 1,
      });
    }
    offset = result.at(-1)?.end ?? offset;
  }
  return result;
}

async function readFixture(fileName: string): Promise<Buffer> {
  return await fs.promises.readFile(path.join(dirname, 'fixtures', fileName));
}

describe('decode', () => {
  test.each(Object.keys(FIXTURES))('should decode %s in one call', async (fileName) => {
    const xz = await readFixture(fileName);
    const expected = FIXTURES[fileName].input();
    // Everything but the end marker, index, and footer, which xdelta3 never writes
    const input = xz.subarray(0, chunks(xz).at(-1)?.end);
    expect(new XzStreamDecoder().decode(input, expected.length)).toEqual(expected);
  });

  test.each(Object.keys(FIXTURES))('should decode %s one chunk per call', async (fileName) => {
    const xz = await readFixture(fileName);
    const xzStreamDecoder = new XzStreamDecoder();
    const outputs = chunks(xz).map((chunk, index) =>
      xzStreamDecoder.decode(
        xz.subarray(index === 0 ? 0 : chunk.start, chunk.end),
        chunk.uncompressedSize,
      ),
    );
    expect(Buffer.concat(outputs)).toEqual(FIXTURES[fileName].input());
  });

  it('should only read the headers on the first call', () => {
    const xzStreamDecoder = new XzStreamDecoder();
    expect(
      xzStreamDecoder.decode(Buffer.concat([HEADERS, Buffer.from('010002616263', 'hex')]), 3),
    ).toEqual(Buffer.from('abc'));
    expect(xzStreamDecoder.decode(Buffer.from('02000064', 'hex'), 1)).toEqual(Buffer.from('d'));
  });

  it('should decode a call with no chunks to no output', () => {
    expect(new XzStreamDecoder().decode(HEADERS, 0)).toEqual(Buffer.alloc(0));
  });

  test.each([
    ['a truncated stream header', Buffer.from('fd377a', 'hex'), 3, 'xz stream header is truncated'],
    [
      'too little output',
      Buffer.concat([HEADERS, Buffer.from('010002616263', 'hex')]),
      4,
      'xz decoder produced 3 bytes, expected 4',
    ],
    [
      'too much output',
      Buffer.concat([HEADERS, Buffer.from('010002616263', 'hex')]),
      2,
      'xz decoder produced 3 bytes, expected 2',
    ],
    [
      'unused input',
      Buffer.concat([HEADERS, Buffer.from('01000261626302000064', 'hex')]),
      3,
      'xz decoder left 4 bytes of input unused',
    ],
  ])('should throw on %s', (_name, input, outputSize, expectedError) => {
    expect(() => new XzStreamDecoder().decode(input, outputSize)).toThrow(expectedError);
  });

  it('should keep throwing after an earlier error', () => {
    const xzStreamDecoder = new XzStreamDecoder();
    expect(
      xzStreamDecoder.decode(Buffer.concat([HEADERS, Buffer.from('010002616263', 'hex')]), 3),
    ).toEqual(Buffer.from('abc'));
    let firstError: unknown;
    try {
      xzStreamDecoder.decode(Buffer.from('03', 'hex'), 1);
    } catch (error) {
      firstError = error;
    }
    expect(firstError).toEqual(
      new Error('LZMA data is corrupt: the LZMA2 control byte 0x3 is invalid'),
    );
    // Valid input on its own, but the decoder already failed, so it refuses it
    expect(() => xzStreamDecoder.decode(Buffer.from('02000064', 'hex'), 1)).toThrow(
      expect.objectContaining({
        message: "xz decoder can't continue after an earlier error",
        cause: firstError,
      }),
    );
  });

  it('should throw on corrupt LZMA data', async () => {
    const xz = await readFixture('randomFirst.xz');
    const chunkList = chunks(xz);
    const lastChunk = chunkList.at(-1);
    if (lastChunk === undefined) {
      throw new Error('the fixture has no chunks');
    }
    const corrupt = Buffer.from(xz.subarray(0, lastChunk.end));
    corrupt[lastChunk.dataStart + 1000] ^= 0xff;
    const expectedSize = FIXTURES['randomFirst.xz'].input().length;
    expect(() => new XzStreamDecoder().decode(corrupt, expectedSize)).toThrow(
      /LZMA data is corrupt/,
    );
  });
});
