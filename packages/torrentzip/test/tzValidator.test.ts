import path from 'node:path';

import { ZipReader } from '@igir/zip';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import Options from '../../../src/types/options.js';
import TZValidator from '../src/tzValidator.js';

const zipFiles = (await FsPoly.walk(path.join('test', 'fixtures', 'roms')))
  .filter((filePath) => filePath.endsWith('.zip'))
  .filter((filePath) => !filePath.includes('invalid'));
test.each(zipFiles)('fixtures should be invalid TorrentZip files: %s', async (zipFile) => {
  await expect(TZValidator.validate(new ZipReader(zipFile))).resolves.toEqual(false);
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
        excludeDisks: true,
        dirDatName: true,
        disableCache: true,
      }),
      new Logger(LogLevel.NEVER),
    ).main();

    const writtenFiles = await FsPoly.walk(tempDir);
    for (const writtenFile of writtenFiles) {
      await expect(TZValidator.validate(new ZipReader(writtenFile))).resolves.toEqual(true);
    }
  } finally {
    await FsPoly.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
