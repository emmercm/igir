import APSN64Patch from '../../../src/models/patches/apsN64Patch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = APSN64Patch.patchFrom.bind(APSN64Patch);
const FILE_NAME = 'patch 00000000.aps';
// "APS10", type 0 (simple), encoding 0, 50-byte description; a 4-byte LE size follows
const SIMPLE = `415053313000${'00'.repeat(51)}`;
// "APS10", type 1 (N64), encoding 0, description, format, cart ID, country, CRC, padding
const N64 = `415053313001${'00'.repeat(68)}`;
// Record at 0x02: 2 bytes aabb; RLE record at 0x08: 4 × cc
const RECORDS = '0200000002aabb0800000000cc04';

describe('patchFrom', () => {
  test.each([
    ['simple', `${SIMPLE}10000000`, { crcBefore: '00000000', crcAfter: undefined, sizeAfter: 16 }],
    ['n64', `${N64}14000000`, { crcBefore: '00000000', crcAfter: undefined, sizeAfter: 20 }],
  ])('should parse: %s', async (_name, patchHex, expected) => {
    await expect(parsePatch(patchFrom, FILE_NAME, patchHex)).resolves.toEqual(expected);
  });

  test.each([
    [
      'unsupported type',
      `415053313002${'00'.repeat(51)}10000000`,
      /APS \(N64\) patch type 2 isn't supported/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(parsePatch(patchFrom, FILE_NAME, patchHex)).rejects.toThrow(expectedError);
  });
});

describe('createPatchedFile', () => {
  test.each([
    ['simple', `${SIMPLE}10000000${RECORDS}`, '0001aabb04050607cccccccc0c0d0e0f'],
    ['n64', `${N64}10000000${RECORDS}`, '0001aabb04050607cccccccc0c0d0e0f'],
    ['grow', `${SIMPLE}140000001000000004aabbccdd`, `${INPUT16}aabbccdd`],
    ['shrink', `${SIMPLE}0c0000000000000001ff`, 'ff0102030405060708090a0b'],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).resolves.toEqual(expectedHex);
  });

  test.each([
    ['bad header', `4150533131${'00'.repeat(52)}10000000`, /APS \(N64\) patch header is invalid/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
