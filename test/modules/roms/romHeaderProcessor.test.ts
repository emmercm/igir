import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import ROMHeaderProcessor from '../../../src/modules/roms/romHeaderProcessor.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

describe('extension has possible header', () => {
  it('should do nothing if extension not found', async () => {
    const inputRomFiles = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/{,**/}*.rom'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options({
        commands: ['copy', 'extract'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      // CRC should NOT have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(true);
    }
  });

  it('should not throw on non-existent files', async () => {
    const tempPath = path.join(Temp.getTempDir(), 'file.nes');
    await expect(FsPoly.exists(tempPath)).resolves.toEqual(false);
    const inputRomFiles = [await File.fileOf({ filePath: tempPath })];

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options({
        commands: ['copy', 'extract'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(1);
    expect(processedRomFiles[0].getFileHeader()).toBeUndefined();
  });

  it('should process raw headered files', async () => {
    const inputRomFiles = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/headered/*{.a78,.lnx,.nes,.fds,.smc}*'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options({
        commands: ['copy', 'extract'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).not.toBeUndefined();
      // CRC should have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(false);
    }
  });

  it('should not process archived headered files if not manipulating', async () => {
    const inputRomFiles = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/headered/*{.7z,.rar,.zip}'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options(),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).toBeUndefined();
      // CRC should NOT have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(true);
    }
  });
});

describe('should read file for header', () => {
  it('should do nothing with headerless files', async () => {
    const inputRomFiles = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/!(headered){,/}*'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options({
        commands: ['copy', 'extract'],
        header: '**/*',
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).toBeUndefined();
      // CRC should NOT have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(true);
    }
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/headered/!(*{.a78,.lnx,.nes,.fds,.smc}*)'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options({
        commands: ['copy', 'extract'],
        header: '**/*',
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).not.toBeUndefined();
      // CRC should have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(false);
    }
  });
});
