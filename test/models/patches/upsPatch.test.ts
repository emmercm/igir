import zlib from 'node:zlib';

import UPSPatch from '../../../src/models/patches/upsPatch.js';
import {
  applyPatch,
  encodeCrc32,
  encodeUpsUint,
  INPUT16,
  parsePatch,
  patterned,
} from './patchTestUtil.js';

const patchFrom = UPSPatch.patchFrom.bind(UPSPatch);

const LARGE_SOURCE = patterned(100_000);
const LARGE_TARGET_SIZE = 200_000;
// The first block is larger than a chunk, and continues past the end of the source
const LARGE_FIRST_BLOCK = patterned(150_000, 7);
const LARGE_SECOND_BLOCK_GAP = 1000;
const LARGE_SECOND_BLOCK = patterned(20_000, 9);

const LARGE_TARGET = ((): Buffer => {
  const target = Buffer.alloc(LARGE_TARGET_SIZE);
  LARGE_SOURCE.copy(target);
  for (const [idx, xorByte] of LARGE_FIRST_BLOCK.entries()) {
    target[idx] ^= xorByte;
  }
  const secondBlockOffset = LARGE_FIRST_BLOCK.length + 1 + LARGE_SECOND_BLOCK_GAP;
  for (const [idx, xorByte] of LARGE_SECOND_BLOCK.entries()) {
    target[secondBlockOffset + idx] ^= xorByte;
  }
  return target;
})();

const LARGE_PATCH = ((): Buffer => {
  const body = Buffer.concat([
    Buffer.from('UPS1'),
    encodeUpsUint(LARGE_SOURCE.length),
    encodeUpsUint(LARGE_TARGET_SIZE),
    encodeUpsUint(0),
    LARGE_FIRST_BLOCK,
    Buffer.of(0x00),
    encodeUpsUint(LARGE_SECOND_BLOCK_GAP),
    LARGE_SECOND_BLOCK,
    Buffer.of(0x00),
    encodeCrc32(LARGE_SOURCE),
    encodeCrc32(LARGE_TARGET),
  ]);
  return Buffer.concat([body, encodeCrc32(body)]);
})();

describe('patchFrom', () => {
  test.each([
    [
      'modify',
      '55505331909082ffff0084a90088e2cecec2109b1e863d5c67',
      { crcBefore: 'cecee288', crcAfter: '1e9b10c2', sizeAfter: 16 },
    ],
    [
      'shrink',
      '55505331908c80ff0088e2cece00b869a4ea59db36',
      { crcBefore: 'cecee288', crcAfter: 'a469b800', sizeAfter: 12 },
    ],
  ])('should parse: %s', async (_name, patchHex, expected) => {
    await expect(parsePatch(patchFrom, 'patch.ups', patchHex)).resolves.toEqual(expected);
  });

  it('should parse a patch larger than a chunk', async () => {
    await expect(parsePatch(patchFrom, 'patch.ups', LARGE_PATCH.toString('hex'))).resolves.toEqual({
      crcBefore: zlib.crc32(LARGE_SOURCE).toString(16).padStart(8, '0'),
      crcAfter: zlib.crc32(LARGE_TARGET).toString(16).padStart(8, '0'),
      sizeAfter: LARGE_TARGET_SIZE,
    });
  });

  test.each([
    [
      'contents crc mismatch',
      '55505331909082ffff0084a90088e2cecec2109b1e863d5c66',
      /UPS patch is invalid, CRC of contents \(675c3d86\) doesn't match expected \(665c3d86\)/,
    ],
    ['only a header', '55505331', /UPS patch is truncated/],
    // Source and target sizes, but no room for the CRC32 footer
    ['a missing footer', '555053319090', /UPS patch is truncated/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(parsePatch(patchFrom, 'patch.ups', patchHex)).rejects.toThrow(expectedError);
  });
});

describe('createPatchedFile', () => {
  test.each([
    [
      'modify',
      '55505331909082ffff0084a90088e2cecec2109b1e863d5c67',
      '0001fdfc0405060708a00a0b0c0d0e0f',
    ],
    ['grow', '55505331909490aabbccdd0088e2cececa8e9afe02c6e8d7', `${INPUT16}aabbccdd`],
    ['grow with zeros', '55505331909488e2cece71506a8ac86c2ccb', `${INPUT16}00000000`],
    ['shrink', '55505331908c80ff0088e2cece00b869a4ea59db36', 'ff0102030405060708090a0b'],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, 'patch.ups', patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  it('should apply blocks larger than a chunk', async () => {
    await expect(
      applyPatch(patchFrom, 'patch.ups', LARGE_PATCH.toString('hex'), LARGE_SOURCE.toString('hex')),
    ).resolves.toEqual(LARGE_TARGET);
  });

  test.each([
    [
      'no terminator',
      '55505331909082ffff88e2cece88e2cecec7db0d2b',
      /failed to read 0x00 block termination/,
    ],
    [
      'wrong size',
      '55505331888880ff009f68aa88796ee1aec027ab49',
      /UPS patch expected ROM size of 8B/,
    ],
    ['bad header', '55505332909088e2cece88e2cecef2d44c89', /UPS patch header is invalid/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, 'patch.ups', patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
