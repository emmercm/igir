import { PassThrough } from 'node:stream';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

test.each([
  // One input path
  [['test/fixtures/roms/**/*'], { roms: 36 }],
  [['test/fixtures/roms/7z/*'], { '7z': 6 }],
  [['test/fixtures/roms/chd/*'], { chd: 4 }],
  [['test/fixtures/roms/cso/*'], { cso: 1 }],
  [['test/fixtures/roms/discs/*'], { discs: 3 }],
  [['test/fixtures/roms/gz/*'], { gz: 7 }],
  [['test/fixtures/roms/headered/*'], { headered: 6 }],
  [['test/fixtures/roms/headerless/*'], { headerless: 1 }],
  [['test/fixtures/roms/nkit/*'], { nkit: 1 }],
  [['test/fixtures/roms/rar/*'], { rar: 6 }],
  [['test/fixtures/roms/raw/*'], { raw: 10 }],
  [['test/fixtures/roms/tar/*'], { tar: 6 }],
  [['test/fixtures/roms/zip/*'], { zip: 7 }],
  // Multiple input paths
  [
    [
      'test/fixtures/roms/headered',
      'test/fixtures/roms/patchable/*',
      'test/fixtures/roms/headerless/**/*',
    ],
    {
      headered: 6,
      patchable: 9,
      headerless: 1,
    },
  ],
])('should infer DATs: %s', async (input, expected) => {
  // Given
  const options = new Options({ input });
  const romFiles = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), new Logger(LogLevel.NEVER, new PassThrough())),
  ).scan();

  // When
  const dats = await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);

  // Then
  const datNameToGameCount = Object.fromEntries(
    dats.map((dat) => [dat.getName(), dat.getGames().length]),
  );
  expect(datNameToGameCount).toEqual(expected);
});
