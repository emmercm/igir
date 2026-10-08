import PPFPatch from '../../../src/models/patches/ppfPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = PPFPatch.patchFrom.bind(PPFPatch);
const FILE_NAME = 'patch 00000000.ppf';
// "PPF20", encoding 1, 50-byte description; then a 4-byte LE size and a 1024-byte block check
const V2 = `505046323001${'00'.repeat(50)}`;
// "PPF30", encoding 2, 50-byte description, image type 0; block check, undo, and dummy bytes follow
const V3 = `505046333002${'00'.repeat(50)}00`;
const OUTPUT = '0001aabb0405060708090a0b0c0d0e0f';

describe('patchFrom', () => {
  it('should parse', async () => {
    await expect(parsePatch(patchFrom, FILE_NAME, `${V3}000000`)).resolves.toEqual({
      crcBefore: '00000000',
      crcAfter: undefined,
      sizeAfter: undefined,
    });
  });
});

describe('createPatchedFile', () => {
  test.each([
    ['v2', `${V2}10000000${'00'.repeat(1024)}0200000002aabb`, OUTPUT],
    ['v3', `${V3}000000020000000000000002aabb`, OUTPUT],
    ['v3 block check', `${V3}010000${'00'.repeat(1024)}020000000000000002aabb`, OUTPUT],
    [
      'v3 undo',
      `${V3}000100020000000000000002aabb0203080000000000000001cc08`,
      '0001aabb04050607cc090a0b0c0d0e0f',
    ],
    ['v3 grow', `${V3}000000100000000000000002eeff`, `${INPUT16}eeff`],
    [
      'v3 file_id.diz',
      `${V3}000000020000000000000002aabb40424547494e5f46494c455f49442e44495a686940454e445f46494c455f49442e44495a0200`,
      OUTPUT,
    ],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  test.each([
    ['bad header', '58595a333002', /PPF patch header is invalid/],
    ['version mismatch', '505046333001', /PPF patch header has an invalid version/],
    ['v1', `5050463130${'00'.repeat(51)}`, /PPF v1 isn't supported/],
    [
      'v2 wrong size',
      `${V2}08000000${'00'.repeat(1024)}0200000002aabb`,
      /PPF patch expected ROM size of 8B/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
