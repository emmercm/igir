import zlib from 'node:zlib';

import BPSPatch from '../../../src/models/patches/bpsPatch.js';
import {
  applyPatch,
  encodeCrc32,
  encodeUpsUint,
  INPUT16,
  parsePatch,
  patterned,
} from './patchTestUtil.js';

const patchFrom = BPSPatch.patchFrom.bind(BPSPatch);

// Every action is longer than one 64 KiB chunk
const LARGE_LENGTH = 70_000;
const LARGE_SOURCE = patterned(150_000);
const LARGE_TARGET_READ_DATA = patterned(LARGE_LENGTH, 100);
const LARGE_SOURCE_COPY_OFFSET = 10_000;
// TARGET_COPY repeats the last 3 bytes written, so it overlaps its own output
const LARGE_TARGET_COPY_DISTANCE = 3;

const LARGE_TARGET = ((): Buffer => {
  const target = Buffer.concat([
    LARGE_SOURCE.subarray(0, LARGE_LENGTH),
    LARGE_TARGET_READ_DATA,
    LARGE_SOURCE.subarray(LARGE_SOURCE_COPY_OFFSET, LARGE_SOURCE_COPY_OFFSET + LARGE_LENGTH),
    Buffer.alloc(LARGE_LENGTH),
  ]);
  for (let i = 3 * LARGE_LENGTH; i < target.length; i += 1) {
    target[i] = target[i - LARGE_TARGET_COPY_DISTANCE];
  }
  return target;
})();

const LARGE_PATCH = ((): Buffer => {
  const actionHeader = (action: number): Buffer => encodeUpsUint((LARGE_LENGTH - 1) * 4 + action);
  const body = Buffer.concat([
    Buffer.from('BPS1'),
    encodeUpsUint(LARGE_SOURCE.length),
    encodeUpsUint(LARGE_TARGET.length),
    encodeUpsUint(0), // metadata size
    actionHeader(0), // SOURCE_READ
    actionHeader(1), // TARGET_READ
    LARGE_TARGET_READ_DATA,
    actionHeader(2), // SOURCE_COPY
    encodeUpsUint(LARGE_SOURCE_COPY_OFFSET * 2),
    actionHeader(3), // TARGET_COPY
    encodeUpsUint((3 * LARGE_LENGTH - LARGE_TARGET_COPY_DISTANCE) * 2),
    encodeCrc32(LARGE_SOURCE),
    encodeCrc32(LARGE_TARGET),
  ]);
  return Buffer.concat([body, encodeCrc32(body)]);
})();

describe('patchFrom', () => {
  test.each([
    [
      'target copy',
      '42505331908a8085abcd9780878988e2cecea1f53268f3729e39',
      { crcBefore: 'cecee288', crcAfter: '6832f5a1', sizeAfter: 10 },
    ],
    [
      'read/copy',
      '425053319090808c8daabbccdd8e988ea188e2cece000e9b445fbf2429',
      { crcBefore: 'cecee288', crcAfter: '449b0e00', sizeAfter: 16 },
    ],
  ])('should parse: %s', async (_name, patchHex, expected) => {
    await expect(parsePatch(patchFrom, 'patch.bps', patchHex)).resolves.toEqual(expected);
  });

  it('should parse a patch larger than a chunk', async () => {
    await expect(parsePatch(patchFrom, 'patch.bps', LARGE_PATCH.toString('hex'))).resolves.toEqual({
      crcBefore: zlib.crc32(LARGE_SOURCE).toString(16).padStart(8, '0'),
      crcAfter: zlib.crc32(LARGE_TARGET).toString(16).padStart(8, '0'),
      sizeAfter: LARGE_TARGET.length,
    });
  });

  test.each([
    [
      'contents crc mismatch',
      '42505331908a8085abcd9780878988e2cecea1f53268f3729e38',
      /BPS patch is invalid, CRC of contents \(399e72f3\) doesn't match expected \(389e72f3\)/,
    ],
    ['only a header', '42505331', /BPS patch is truncated/],
    // Source and target sizes, but no room for the CRC32 footer
    ['a missing footer', '425053319090', /BPS patch is truncated/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(parsePatch(patchFrom, 'patch.bps', patchHex)).rejects.toThrow(expectedError);
  });
});

describe('createPatchedFile', () => {
  test.each([
    // SOURCE_READ, TARGET_READ, and SOURCE_COPY with a negative relative offset
    [
      'read/copy',
      '425053319090808c8daabbccdd8e988ea188e2cece000e9b445fbf2429',
      '00010203aabbccdd0c0d0e0f00010203',
    ],
    // TARGET_COPY overlapping its own output
    ['target copy', '42505331908a8085abcd9780878988e2cecea1f53268f3729e39', 'abcd'.repeat(5)],
    ['metadata', '42505331909083616263bc88e2cece88e2cece3485242e', INPUT16],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, 'patch.bps', patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  it('should apply actions larger than a chunk', async () => {
    await expect(
      applyPatch(patchFrom, 'patch.bps', LARGE_PATCH.toString('hex'), LARGE_SOURCE.toString('hex')),
    ).resolves.toEqual(LARGE_TARGET);
  });

  test.each([
    ['wrong size', '425053318888809c9f68aa889f68aa88e28ab048', /BPS patch expected ROM size of 8B/],
    ['bad header', '42505332909080bc88e2cece88e2cece5e0c26c8', /BPS patch header is invalid/],
    // SOURCE_COPY with a relative offset of -1 from the start of the source
    [
      'negative source offset',
      '425053319084808e8388e2cece00000000b9008eef',
      /negative position -1/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, 'patch.bps', patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
