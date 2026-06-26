import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import Options, { ZipFormat, ZipFormatInverted } from '../../../src/models/options.js';
import FsUtil, { WalkMode } from '../../../src/utils/fsUtil.js';
import { ZipReader } from '../../zip/index.js';
import type { ValidationResultValue } from '../src/tzValidator.js';
import TZValidator, { ValidationResult } from '../src/tzValidator.js';
import type { CompressionMethodValue } from '../src/tzWriter.js';

const zipFiles = (await FsUtil.walk(path.join('test', 'fixtures', 'roms'), WalkMode.FILES))
  .filter((filePath) => filePath.endsWith('.zip'))
  .filter((filePath) => !filePath.includes('invalid'));
test.each(zipFiles)('fixtures should be invalid TorrentZip/RVZSTD files: %s', async (zipFile) => {
  await expect(TZValidator.validate(new ZipReader(zipFile))).resolves.toEqual(
    ValidationResult.INVALID,
  );
});

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
