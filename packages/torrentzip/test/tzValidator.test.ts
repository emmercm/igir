import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import Options, { ZipFormat, ZipFormatInverted } from '../../../src/models/options.js';
import FsUtil, { WalkMode } from '../../../src/utils/fsUtil.js';
import { ZipReader } from '../../zip/index.js';
import type { ValidationResultValue } from '../src/tzValidator.js';
import TZValidator, { ValidationResult } from '../src/tzValidator.js';
import type { CompressionMethodValue } from '../src/tzWriter.js';
import TZWriter, { CompressionMethod } from '../src/tzWriter.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

const zipFiles = (await FsUtil.walk(path.join('test', 'fixtures', 'roms'), WalkMode.FILES))
  .filter((filePath) => filePath.endsWith('.zip'))
  .filter((filePath) => !filePath.includes('invalid'));
test.each(zipFiles)('fixtures should be invalid TorrentZip/RVZSTD files: %s', async (zipFile) => {
  await expect(TZValidator.validate(new ZipReader(zipFile))).resolves.toEqual(
    ValidationResult.INVALID,
  );
});

// TorrentZip sorts filenames by their lowercased code units, which is not the same order that
// locale-aware collation produces for names that differ only by punctuation
test.each([
  [
    // ')' (0x29) sorts before ',' (0x2C)
    [
      'Mystery Case Files - MillionHeir (Europe).bin',
      'Mystery Case Files - MillionHeir (Europe, Australia).bcn',
    ],
    CompressionMethod.DEFLATE,
    ValidationResult.VALID_TORRENTZIP,
  ],
  [
    [
      'Mystery Case Files - MillionHeir (Europe).bin',
      'Mystery Case Files - MillionHeir (Europe, Australia).bcn',
    ],
    CompressionMethod.ZSTD,
    ValidationResult.VALID_RVZSTD,
  ],
  [
    // ' ' (0x20) sorts before '.' (0x2E)
    ['Mystery Case Files - MillionHeir (USA).bcn', 'Mystery Case Files - MillionHeir.nds'],
    CompressionMethod.DEFLATE,
    ValidationResult.VALID_TORRENTZIP,
  ],
  [
    // '-' (0x2D) sorts before '.' (0x2E)
    ['Rhythm Heaven-1.bin', 'Rhythm Heaven.nds'],
    CompressionMethod.DEFLATE,
    ValidationResult.VALID_TORRENTZIP,
  ],
])(
  'should validate filenames sorted by code unit: %s',
  async (
    fileNames: string[],
    compressionMethod: CompressionMethodValue,
    expectedResult: ValidationResultValue,
  ) => {
    const tempZipPath = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'sorting.zip'));

    try {
      const tempZip = await TZWriter.open(tempZipPath, compressionMethod);
      for (const fileName of fileNames) {
        const readable = stream.Readable.from(Buffer.from(fileName));
        await tempZip.addStream(
          readable,
          fileName,
          Buffer.byteLength(fileName),
          os.availableParallelism(),
        );
      }
      await tempZip.finalize();

      await expect(TZValidator.validate(new ZipReader(tempZipPath))).resolves.toEqual(
        expectedResult,
      );
    } finally {
      await FsUtil.rm(tempZipPath, { force: true });
    }
  },
);

const VALIDATION_MAP: Record<CompressionMethodValue, ValidationResultValue> = {
  [ZipFormat.TORRENTZIP]: ValidationResult.VALID_TORRENTZIP,
  [ZipFormat.RVZSTD]: ValidationResult.VALID_RVZSTD,
} as const;

const romDirs = (await FsUtil.dirs(path.join('test', 'fixtures', 'roms'))).filter(
  (dirPath) => !['chd', 'cso', 'gcz', 'nkit', 'rvz', 'wia'].includes(path.basename(dirPath)),
);

describe.each([ZipFormat.TORRENTZIP, ZipFormat.RVZSTD])('zip format: %s', (zipFormat) => {
  test.each(romDirs)('should write valid zip files: %s', async (input) => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());

    try {
      await new Igir(
        new Options({
          commands: ['copy', 'zip'],
          dat: [path.join('test', 'fixtures', 'dats')],
          input: [input],
          output: tempDir,
          zipFormat: ZipFormatInverted[zipFormat].toLowerCase(),
          excludeDisks: true,
          dirDatName: true,
          disableCache: true,
        }),
      ).main();

      const writtenFiles = await FsUtil.walk(tempDir, WalkMode.FILES);
      expect(writtenFiles.length).toBeGreaterThan(0);
      for (const writtenFile of writtenFiles) {
        await expect(TZValidator.validate(new ZipReader(writtenFile))).resolves.toEqual(
          VALIDATION_MAP[zipFormat],
        );
      }
    } finally {
      await FsUtil.rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  });
});
