import ROMHeaderProcessor from '../../src/modules/romHeaderProcessor.js';
import ROMScanner from '../../src/modules/romScanner.js';
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
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should NOT have changed
      expect(inputRomFiles[i].equals(processedRomFiles[i])).toEqual(true);
    }
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
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should have changed
      expect(inputRomFiles[i].equals(processedRomFiles[i])).toEqual(false);
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
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should NOT have changed
      expect(inputRomFiles[i].equals(processedRomFiles[i])).toEqual(true);
    }
  });
});

describe('should read file for header', () => {
  it('should do nothing with un-headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/!(headered){,/}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);

    const processedRomFiles = await new ROMHeaderProcessor(new Options({
      commands: ['copy', 'extract'],
      header: '**/*',
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should NOT have changed
      expect(inputRomFiles[i].equals(processedRomFiles[i])).toEqual(true);
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
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should have changed
      expect(inputRomFiles[i].equals(processedRomFiles[i])).toEqual(false);
    }
  });
});
