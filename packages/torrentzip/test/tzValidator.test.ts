import path from 'node:path';

import { ZipReader } from '@igir/zip';
import { jest } from '@jest/globals';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import Options, { ZipFormat, ZipFormatInverted } from '../../../src/types/options.js';
import TZValidator, { ValidationResult } from '../src/tzValidator.js';

jest.setTimeout(5 * 60 * 1000); // 5min

const zipFiles = (await FsPoly.walk(path.join('test', 'fixtures', 'roms')))
  .filter((filePath) => filePath.endsWith('.zip'))
  .filter((filePath) => !filePath.includes('invalid'));
test.each(zipFiles)('fixtures should be invalid TorrentZip/RVZSTD files: %s', async (zipFile) => {
  await expect(TZValidator.validate(new ZipReader(zipFile))).resolves.toEqual(
    ValidationResult.INVALID,
  );
});

it('should write valid TorrentZip files', async () => {
  const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

  try {
    await new Igir(
      new Options({
        commands: ['copy', 'zip'],
        dat: [path.join('test', 'fixtures', 'dats')],
        input: [path.join('test', 'fixtures', 'roms')],
        inputExclude: ['**/invalid.*'],
        output: tempDir,
        zipFormat: ZipFormatInverted[ZipFormat.TORRENTZIP].toLowerCase(),
        excludeDisks: true,
        dirDatName: true,
        disableCache: true,
      }),
      new Logger(LogLevel.NEVER),
    ).main();

    const writtenFiles = await FsPoly.walk(tempDir);
    for (const writtenFile of writtenFiles) {
      await expect(TZValidator.validate(new ZipReader(writtenFile))).resolves.toEqual(
        ValidationResult.VALID_TORRENTZIP,
      );
    }
  } finally {
    await FsPoly.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});

it('should write valid RVZSTD files', async () => {
  const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

  try {
    await new Igir(
      new Options({
        commands: ['copy', 'zip'],
        dat: [path.join('test', 'fixtures', 'dats')],
        input: [path.join('test', 'fixtures', 'roms')],
        inputExclude: ['**/invalid.*'],
        output: tempDir,
        zipFormat: ZipFormatInverted[ZipFormat.RVZSTD].toLowerCase(),
        excludeDisks: true,
        dirDatName: true,
        disableCache: true,
      }),
      new Logger(LogLevel.NEVER),
    ).main();

    const writtenFiles = await FsPoly.walk(tempDir);
    for (const writtenFile of writtenFiles) {
      await expect(TZValidator.validate(new ZipReader(writtenFile))).resolves.toEqual(
        ValidationResult.VALID_RVZSTD,
      );
    }
  } finally {
    await FsPoly.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
