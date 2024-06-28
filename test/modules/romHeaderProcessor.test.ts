import path from 'node:path';

import Defaults from '../../src/globals/defaults.js';
import ROMHeaderProcessor from '../../src/modules/romHeaderProcessor.js';
import ROMScanner from '../../src/modules/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

describe('extension has possible header', () => {
  it('should do nothing if extension not found', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/{,**/}*.rom'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      // CRC should NOT have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(true);
    }
  });

  it('should not throw on non-existent files', async () => {
    const tempPath = path.join(Defaults.GLOBAL_TEMP_DIR, 'file.nes');
    await expect(FsPoly.exists(tempPath)).resolves.toEqual(false);
    const inputRomFiles = [await File.fileOf({ filePath: tempPath })];

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(1);
    expect(processedRomFiles[0].getFileHeader()).toBeUndefined();
  });

  it('should process raw headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/*{.a78,.lnx,.nes,.fds,.smc}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).not.toBeUndefined();
      // CRC should have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(false);
    }
  });

  it('should not process archived headered files if not manipulating', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/*{.7z,.rar,.zip}'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(
      new Options(),
      new ProgressBarFake(),
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
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/!(headered){,/}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
      header: '**/*',
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).toBeUndefined();
      // CRC should NOT have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(true);
    }
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/!(*{.a78,.lnx,.nes,.fds,.smc}*)'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
      header: '**/*',
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (const [idx, processedRomFile] of processedRomFiles.entries()) {
      expect(processedRomFile.getFileHeader()).not.toBeUndefined();
      // CRC should have changed
      expect(inputRomFiles[idx].equals(processedRomFile)).toEqual(false);
    }
  });
});
