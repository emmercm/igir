import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import FileCache from '../../../src/models/files/fileCache.js';
import FileFactory from '../../../src/models/files/fileFactory.js';
import ROMHeader from '../../../src/models/files/romHeader.js';
import Options from '../../../src/models/options.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new stream.PassThrough());

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
      new MappableSemaphore(os.availableParallelism()),
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
      new MappableSemaphore(os.availableParallelism()),
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
