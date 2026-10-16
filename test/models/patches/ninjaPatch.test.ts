import NinjaPatch from '../../../src/models/patches/ninjaPatch.js';
import { applyPatch, INPUT16, parsePatch, patterned } from './patchTestUtil.js';

const patchFrom = NinjaPatch.patchFrom.bind(NinjaPatch);
const FILE_NAME = 'patch 00000000.rup';
// "NINJA2", then 2,042 bytes of encoding, author, version, title, genre, language, date, web, and description
const HEADER = `4e494e4a4132${'00'.repeat(2042)}`;
// Source and modified MD5s, which igir doesn't check
const MD5S = '00'.repeat(32);

describe('patchFrom', () => {
  it('should parse', async () => {
    await expect(parsePatch(patchFrom, FILE_NAME, HEADER)).resolves.toEqual({
      crcBefore: '00000000',
      crcAfter: undefined,
      sizeAfter: undefined,
    });
  });
});

describe('createPatchedFile', () => {
  test.each([
    // 16 → 16 bytes; XOR ffff at 0x02
    [
      'same size',
      `${HEADER}01000001100110${MD5S}0201020102ffff00`,
      '0001fdfc0405060708090a0b0c0d0e0f',
    ],
    // 16 → 20 bytes
    [
      'grow',
      `${HEADER}01000001100114${MD5S}410104554433220201000101ff00`,
      'ff0102030405060708090a0b0c0d0e0faabbccdd',
    ],
    // 16 → 12 bytes
    [
      'shrink',
      `${HEADER}0100000110010c${MD5S}4d0104f3f2f1f00201000101ff00`,
      'ff0102030405060708090a0b',
    ],
    // 16 → 12 bytes, with no overflow data
    [
      'shrink without overflow',
      `${HEADER}0100000110010c${MD5S}4d000201000101ff00`,
      'ff0102030405060708090a0b',
    ],
    // 16 → 18 bytes, with no overflow data; XOR 0102 past the end of the input
    [
      'grow by XOR past the end',
      `${HEADER}01000001100112${MD5S}41000201100102010200`,
      '000102030405060708090a0b0c0d0e0f0102',
    ],
    // 16 → 20 bytes, with the overflow data cut short by the end of the patch
    ['overflow cut short', `${HEADER}01000001100114${MD5S}4101045544`, `${INPUT16}aabb`],
    // 16 → 16 bytes; XOR data cut short by the end of the patch, the rest is XORed with 0x00
    [
      'XOR cut short',
      `${HEADER}01000001100110${MD5S}0201020104ffff`,
      '0001fdfc0405060708090a0b0c0d0e0f',
    ],
    // 16 → 18 bytes; XOR data cut short, and past the end of the input
    [
      'XOR cut short past the end',
      `${HEADER}01000001100110${MD5S}02010e0104ffff`,
      '000102030405060708090a0b0c0df1f00000',
    ],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  it('should apply overflow and XOR larger than a chunk', async () => {
    const source = patterned(100_000);
    const overflow = patterned(80_000, 3);
    const xorOffset = 50_000;
    // Spans the end of the source and the start of the overflow
    const xorData = patterned(120_000, 9);

    const sizeField = (value: number): Buffer => {
      const buffer = Buffer.alloc(5);
      buffer.writeUInt8(4);
      buffer.writeUInt32LE(value, 1);
      return buffer;
    };
    const patch = Buffer.concat([
      Buffer.from(HEADER, 'hex'),
      // OPEN: single file, RAW type
      Buffer.of(0x01, 0x00, 0x00),
      sizeField(source.length),
      sizeField(source.length + overflow.length),
      Buffer.from(MD5S, 'hex'),
      Buffer.from('A'),
      sizeField(overflow.length),
      Buffer.from(overflow.map((byte) => byte ^ 0xff)),
      // XOR
      Buffer.of(0x02),
      sizeField(xorOffset),
      sizeField(xorData.length),
      xorData,
      // TERMINATE
      Buffer.of(0x00),
    ]);

    const expected = Buffer.concat([source, overflow]);
    for (const [idx, xorByte] of xorData.entries()) {
      expected[xorOffset + idx] ^= xorByte;
    }
    await expect(
      applyPatch(patchFrom, FILE_NAME, patch.toString('hex'), source.toString('hex')),
    ).resolves.toEqual(expected);
  });

  test.each([
    ['multi-file', `${HEADER}0101`, /Multi-file NINJA patches aren't supported/],
    ['non-RAW file type', `${HEADER}010001`, /unsupported NINJA file type NES/],
    ['v1', '4e494e4a4131', /NINJA v1 isn't supported/],
    ['unsupported command', `${HEADER}03`, /Ninja command 3 isn't supported/],
    ['bad header', '4e494e4a4232', /NINJA patch header is invalid/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
