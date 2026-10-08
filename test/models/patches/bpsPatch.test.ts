import BPSPatch from '../../../src/models/patches/bpsPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = BPSPatch.patchFrom.bind(BPSPatch);

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

  test.each([
    [
      'contents crc mismatch',
      '42505331908a8085abcd9780878988e2cecea1f53268f3729e38',
      /BPS patch is invalid, CRC of contents \(399e72f3\) doesn't match expected \(389e72f3\)/,
    ],
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

  test.each([
    ['wrong size', '425053318888809c9f68aa889f68aa88e28ab048', /BPS patch expected ROM size of 8B/],
    ['bad header', '42505332909080bc88e2cece88e2cece5e0c26c8', /BPS patch header is invalid/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, 'patch.bps', patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
