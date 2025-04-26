import path from 'node:path';

import { TZValidator } from '@igir/torrentzip/index.js';
import { ZipReader } from '@igir/zip/index.js';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import Igir from '../../../src/igir.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import FileChecksums, { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import Options from '../../../src/types/options.js';

it('should write valid zip files', async () => {
  const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

  try {
    await new Igir(
      new Options({
        commands: ['copy', 'zip'],
        dat: [path.join('test', 'fixtures', 'dats')],
        input: [path.join('test', 'fixtures', 'roms')],
        output: tempDir,
        dirDatName: true,
        disableCache: true,
      }),
      new Logger(LogLevel.NEVER),
    ).main();

    const writtenFiles = await FsPoly.walk(tempDir);
    for (const writtenFile of writtenFiles) {
      await TZValidator.validate(new ZipReader(writtenFile));
    }
  } finally {
    await FsPoly.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
