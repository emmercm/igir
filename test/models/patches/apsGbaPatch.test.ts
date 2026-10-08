import APSGBAPatch from '../../../src/models/patches/apsGbaPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = APSGBAPatch.patchFrom.bind(APSGBAPatch);
const FILE_NAME = 'patch 00000000.aps';
const PATTERN = '0123456789abcdef';
// A 64 KiB XOR block that inverts only the first byte
const XOR_FIRST_BYTE = `ff${'00'.repeat(0xff_ff)}`;
// Record header: 4-byte LE offset, CRC16 source, CRC16 target (igir doesn't check them)
const BLOCK_0 = '0000000000000000';
const BLOCK_1 = '0000010000000000';

describe('patchFrom', () => {
  test.each([
    // "APS1", 4-byte LE original size, 4-byte LE patched size
    [
      'same size',
      '415053310000010000000100',
      { crcBefore: '00000000', crcAfter: undefined, sizeAfter: 65_536 },
    ],
    [
      'grow',
      '415053310000010000000200',
      { crcBefore: '00000000', crcAfter: undefined, sizeAfter: 131_072 },
    ],
  ])('should parse: %s', async (_name, patchHex, expected) => {
    await expect(parsePatch(patchFrom, FILE_NAME, patchHex)).resolves.toEqual(expected);
  });
});

describe('createPatchedFile', () => {
  test.each([
    [
      'one block',
      `415053310000010000000100${BLOCK_0}${XOR_FIRST_BYTE}`,
      PATTERN.repeat(8192),
      `fe23456789abcdef${PATTERN.repeat(8191)}`,
    ],
    [
      'two blocks',
      `415053310000020000000200${BLOCK_0}${XOR_FIRST_BYTE}${BLOCK_1}${XOR_FIRST_BYTE}`,
      PATTERN.repeat(16_384),
      `fe23456789abcdef${PATTERN.repeat(8191)}`.repeat(2),
    ],
    [
      'grow',
      `415053310000010000000200${BLOCK_1}${'aa'.repeat(0x1_00_00)}`,
      PATTERN.repeat(8192),
      `${PATTERN.repeat(8192)}${'aa'.repeat(0x1_00_00)}`,
    ],
    [
      'shrink',
      `415053310000020000000100${BLOCK_0}${XOR_FIRST_BYTE}`,
      PATTERN.repeat(16_384),
      `fe23456789abcdef${PATTERN.repeat(8191)}`,
    ],
  ])('should apply: %s', async (_name, patchHex, inputHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, inputHex)).resolves.toEqual(
      expectedHex,
    );
  });

  test.each([
    [
      'wrong size',
      `415053310000010000000100${BLOCK_0}${XOR_FIRST_BYTE}`,
      /APS \(GBA\) patch expected ROM size/,
    ],
    ['bad header', '415053321000000010000000', /APS \(GBA\) patch header is invalid/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
