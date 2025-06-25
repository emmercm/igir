import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../src/async/driveSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Defaults from '../../../src/globals/defaults.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

describe('headerFromFilename', () => {
  test.each(['rom.a78', 'rom.lnx', 'rom.nes', 'rom.fds', 'rom.smc', 'rom.zip.fds'])(
    'should get a file header for extension: %s',
    (filePath) => {
      const fileHeader = ROMHeader.headerFromFilename(filePath);
      expect(fileHeader).toBeDefined();
      expect(fileHeader?.getName()).toBeTruthy();
    },
  );

  test.each(['', '   ', '.nes', 'rom.zip', 'rom.nes.zip'])(
    'should not get a file header for extension: %s',
    (filePath) => {
      const fileHeader = ROMHeader.headerFromFilename(filePath);
      expect(fileHeader).toBeUndefined();
    },
  );
});

describe('headerFromFileStream', () => {
  it('should get a file header for headered files', async () => {
    const headeredRoms = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/headered'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(Defaults.MAX_FS_THREADS),
    ).scan();
    expect(headeredRoms).toHaveLength(6);

    for (const headeredRom of headeredRoms) {
      await headeredRom.createReadStream(async (readable) => {
        const fileHeader = await ROMHeader.headerFromFileStream(readable);
        expect(fileHeader).toBeDefined();
        expect(fileHeader?.getName()).toBeTruthy();
      });
    }
  });

  it('should not get a file header for dummy files', async () => {
    const headeredRoms = await new ROMScanner(
      new Options({
        input: [path.join('test', 'fixtures', 'roms', '!(headered){,/}*')],
        inputExclude: [
          path.join('test', 'fixtures', 'roms', 'chd'),
          path.join('test', 'fixtures', 'roms', 'nkit'),
        ],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(Defaults.MAX_FS_THREADS),
    ).scan();
    expect(headeredRoms.length).toBeGreaterThan(0);

    for (const headeredRom of headeredRoms) {
      await headeredRom.createReadStream(async (readable) => {
        const fileHeader = await ROMHeader.headerFromFileStream(readable);
        expect(fileHeader).toBeUndefined();
      });
    }
  });
});
