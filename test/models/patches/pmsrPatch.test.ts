import path from 'node:path';

import Defaults from '../../../src/globals/defaults.js';
import File from '../../../src/models/files/file.js';
import IOFile from '../../../src/models/files/ioFile.js';
import PMSRPatch from '../../../src/models/patches/pmsrPatch.js';
import { applyPatch, INPUT16, parsePatch, withPatchFile } from './patchTestUtil.js';

const patchFrom = PMSRPatch.patchFrom.bind(PMSRPatch);

/** The size of Paper Mario (USA) v1.0 */
const SOURCE_SIZE = 41_943_040;

/**
 * The only non-zero bytes of the source-sized input ROM, so that it can be written and checked
 * without holding the whole ROM in memory.
 */
const INPUT_WRITES: [number, string][] = [
  [0, INPUT16],
  [SOURCE_SIZE / 2, INPUT16],
  [SOURCE_SIZE - 16, INPUT16],
];

/**
 * Write the input ROM, apply a patch to it, then call {@link verify}, if given, with the output path.
 */
async function applyToInput(
  patchHex: string,
  verify?: (outputPath: string) => Promise<void>,
): Promise<void> {
  await withPatchFile('patch.mod', patchHex, async (file, tempDir) => {
    const patch = patchFrom(file);

    const inputPath = path.join(tempDir, 'input.z64');
    const inputFile = await IOFile.fileOfSize(inputPath, 'r+', SOURCE_SIZE);
    try {
      for (const [offset, hex] of INPUT_WRITES) {
        await inputFile.writeAt(Buffer.from(hex, 'hex'), offset);
      }
    } finally {
      await inputFile.close();
    }

    const outputPath = path.join(tempDir, 'output.z64');
    await patch.createPatchedFile(await File.fileOf({ filePath: inputPath }), outputPath);
    await verify?.(outputPath);
  });
}

/**
 * Return the offsets of every chunk of the file at {@link filePath} that differs from a
 * zero-filled file of {@link expectedSize} overlaid with {@link expectedWrites}, reading one chunk
 * at a time.
 */
async function findMismatchedChunks(
  filePath: string,
  expectedSize: number,
  expectedWrites: [number, string][],
): Promise<number[]> {
  const mismatches: number[] = [];
  const actualFile = await IOFile.fileFrom(filePath, 'r');
  try {
    expect(actualFile.getSize()).toEqual(expectedSize);

    for (let position = 0; position < expectedSize; position += Defaults.FILE_READING_CHUNK_SIZE) {
      const length = Math.min(Defaults.FILE_READING_CHUNK_SIZE, expectedSize - position);
      const expected = Buffer.alloc(length);
      for (const [offset, hex] of expectedWrites) {
        const data = Buffer.from(hex, 'hex');
        const start = Math.max(offset, position);
        const end = Math.min(offset + data.length, position + length);
        if (start < end) {
          data.copy(expected, start - position, start - offset, end - offset);
        }
      }

      if (!(await actualFile.readAt(position, length)).equals(expected)) {
        mismatches.push(position);
      }
    }
  } finally {
    await actualFile.close();
  }
  return mismatches;
}

describe('patchFrom', () => {
  test.each([
    ['without a CRC in the filename', 'patch.mod'],
    ['ignoring a CRC in the filename', 'patch 1a4b9b3c.mod'],
  ])('should parse: %s', async (_name, fileName) => {
    await expect(parsePatch(patchFrom, fileName, '504d535200000000')).resolves.toEqual({
      crcBefore: 'a7f5cd7e',
      crcAfter: undefined,
      sizeAfter: undefined,
    });
  });
});

describe('createPatchedFile', () => {
  test.each([
    ['no records', '504d535200000000', SOURCE_SIZE, []],
    ['one record', '504d5352000000010000001000000002aabb', SOURCE_SIZE, [[0x10, 'aabb']]],
    [
      'multiple records',
      '504d5352000000020000000000000001110000002000000003223344',
      SOURCE_SIZE,
      [
        [0x00, '11'],
        [0x20, '223344'],
      ],
    ],
    [
      'record appended past the end',
      '504d5352000000010280000000000002ccdd',
      SOURCE_SIZE + 2,
      [[SOURCE_SIZE, 'ccdd']],
    ],
    [
      'record spanning the end',
      '504d535200000001027fffff000000021122',
      SOURCE_SIZE + 1,
      [[SOURCE_SIZE - 1, '1122']],
    ],
    // 17 literals, then an 18-byte long-form link and a 13-byte short-form link, both copying
    // the previous byte
    [
      'Yay0 compressed',
      '59617930' +
        '00000030' + // decompressed size
        '00000014' + // link table offset
        '00000018' + // literal data offset
        'ffff8000' + // commands
        '0000b000' + // link table
        '504d5352000000010000001000000020aa00', // literal data
      SOURCE_SIZE,
      [[0x10, 'aa'.repeat(32)]],
    ],
  ] satisfies [string, string, number, [number, string][]][])(
    'should apply: %s',
    async (_name, patchHex, expectedSize, expectedWrites) => {
      await applyToInput(patchHex, async (outputPath) => {
        await expect(
          findMismatchedChunks(outputPath, expectedSize, [...INPUT_WRITES, ...expectedWrites]),
        ).resolves.toEqual([]);
      });
    },
  );

  test.each([
    ['bad header', '504d535800000000', /PMSR patch header is invalid/],
    ['short header', '504d5352', /PMSR patch header is invalid/],
    ['truncated record header', '504d535200000001000000', /PMSR patch is truncated/],
    ['truncated record data', '504d5352000000010000000000000004aa', /PMSR patch is truncated/],
    [
      'Yay0 not containing PMSR',
      '59617930000000040000001400000014f000000061626364',
      /PMSR patch header is invalid/,
    ],
    ['Yay0 short header', '596179300000', /PMSR patch Yay0 compression is invalid/],
    [
      'Yay0 missing commands',
      '59617930000000040000001000000010',
      /PMSR patch Yay0 compression is invalid/,
    ],
    [
      'Yay0 link before the start',
      '5961793000000004000000140000001600000000000000',
      /PMSR patch Yay0 compression is invalid/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyToInput(patchHex)).rejects.toThrow(expectedError);
  });

  it('should throw on the wrong input size', async () => {
    await expect(applyPatch(patchFrom, 'patch.mod', '504d535200000000', INPUT16)).rejects.toThrow(
      /PMSR patch expected ROM size of /,
    );
  });
});
