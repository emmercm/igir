import path from 'node:path';
import { PassThrough } from 'node:stream';

import { jest } from '@jest/globals';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import FsPoly, { WalkMode } from '../../../src/polyfill/fsPoly.js';
import Options, { ZipFormat, ZipFormatInverted } from '../../../src/types/options.js';
import { ZipReader } from '../../zip/index.js';
import TZValidator, { ValidationResult, ValidationResultValue } from '../src/tzValidator.js';
import { CompressionMethodValue } from '../src/tzWriter.js';

jest.setTimeout(5 * 60 * 1000); // 5min for QEMU cross-build testing

const zipFiles = (await FsPoly.walk(path.join('test', 'fixtures', 'roms'), WalkMode.FILES))
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

test.each([ZipFormat.TORRENTZIP, ZipFormat.RVZSTD])(
  'should write valid zip files: %s',
  async (zipFormat) => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

    try {
      await new Igir(
        new Options({
          commands: ['copy', 'zip'],
          dat: [path.join('test', 'fixtures', 'dats')],
          input: [path.join('test', 'fixtures', 'roms')],
          inputExclude: [path.join('test', 'fixtures', 'roms', '{gcz,rvz,wia}', '**')],
          output: tempDir,
          zipFormat: ZipFormatInverted[zipFormat].toLowerCase(),
          excludeDisks: true,
          dirDatName: true,
          disableCache: true,
        }),
        new Logger(LogLevel.NEVER, new PassThrough()),
      ).main();

      const writtenFiles = await FsPoly.walk(tempDir, WalkMode.FILES);
      for (const writtenFile of writtenFiles) {
        await expect(TZValidator.validate(new ZipReader(writtenFile))).resolves.toEqual(
          VALIDATION_MAP[zipFormat],
        );
      }
    } finally {
      await FsPoly.rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  },
);
