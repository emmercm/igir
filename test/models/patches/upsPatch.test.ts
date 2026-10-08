import UPSPatch from '../../../src/models/patches/upsPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = UPSPatch.patchFrom.bind(UPSPatch);

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

  test.each([
    [
      'contents crc mismatch',
      '55505331909082ffff0084a90088e2cecec2109b1e863d5c66',
      /UPS patch is invalid, CRC of contents \(675c3d86\) doesn't match expected \(665c3d86\)/,
    ],
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
