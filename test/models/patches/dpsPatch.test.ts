import DPSPatch from '../../../src/models/patches/dpsPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = DPSPatch.patchFrom.bind(DPSPatch);
const FILE_NAME = 'patch 00000000.dps';
// 64-byte name, author, and version; 1-byte flag and version; then a 4-byte LE original size
const HEADER = '00'.repeat(194);
// Mode 0: copy from the input. [mode][LE output offset][LE input offset][LE length]
// Mode 1: enclosed data. [mode][LE output offset][LE length][data]

describe('patchFrom', () => {
  it('should parse', async () => {
    await expect(parsePatch(patchFrom, FILE_NAME, `${HEADER}10000000`)).resolves.toEqual({
      crcBefore: '00000000',
      crcAfter: undefined,
      sizeAfter: undefined,
    });
  });
});

describe('createPatchedFile', () => {
  test.each([
    [
      'mode 0 swap',
      `${HEADER}100000000000000000080000000800000000080000000000000008000000`,
      '08090a0b0c0d0e0f0001020304050607',
    ],
    [
      'mode 1',
      `${HEADER}1000000000000000000000000010000000010400000002000000aabb`,
      '00010203aabb060708090a0b0c0d0e0f',
    ],
    [
      'grow',
      `${HEADER}1000000000000000000000000010000000011000000004000000aabbccdd`,
      `${INPUT16}aabbccdd`,
    ],
    ['shrink', `${HEADER}1000000000000000000400000008000000`, '0405060708090a0b'],
    [
      'gap is zero',
      `${HEADER}10000000010000000002000000aabb010600000002000000ccdd`,
      'aabb00000000ccdd',
    ],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  test.each([
    ['unsupported mode', `${HEADER}100000000200000000`, /DPS patch mode type 2 isn't supported/],
    [
      'wrong size',
      `${HEADER}0800000000000000000000000008000000`,
      /DPS patch expected ROM size of 8B/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
