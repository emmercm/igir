import HeaderProcessor from '../../src/modules/headerProcessor.js';
import ROMScanner from '../../src/modules/romScanner.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

describe('extension has possible header', () => {
  it('should do nothing if extension not found', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/{,**/}*.rom'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.size).toBeGreaterThan(0);

    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(inputRomFiles);

    expect(processedRomFiles).toHaveProperty('size', inputRomFiles.size);
    processedRomFiles.forEach((processedRomFile, key) => {
      expect((inputRomFiles.get(key) as File).equals(processedRomFile)).toEqual(true);
    });
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/*{.a78,.lnx,.nes,.fds}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.size).toBeGreaterThan(0);

    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(inputRomFiles);

    expect(processedRomFiles).toHaveProperty('size', inputRomFiles.size * 2);
    inputRomFiles.forEach((inputRomFile, key) => {
      // CRC should have changed
      expect(inputRomFile.equals(processedRomFiles.get(key) as File)).toEqual(false);
    });
  });
});

describe('should read file for header', () => {
  it('should do nothing with un-headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/!(headered){,/}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.size).toBeGreaterThan(0);

    const processedRomFiles = await new HeaderProcessor(new Options({
      header: '**/*',
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveProperty('size', inputRomFiles.size);
    processedRomFiles.forEach((processedRomFile, key) => {
      expect((inputRomFiles.get(key) as File).equals(processedRomFile)).toEqual(true);
    });
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/!(*{.a78,.lnx,.nes,.fds}*)'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.size).toBeGreaterThan(0);

    const processedRomFiles = await new HeaderProcessor(new Options({
      header: '**/*',
    }), new ProgressBarFake()).process(inputRomFiles);

    expect(processedRomFiles).toHaveProperty('size', inputRomFiles.size * 2);
    inputRomFiles.forEach((inputRomFile, key) => {
      // CRC should have changed
      expect(inputRomFile.equals(processedRomFiles.get(key) as File)).toEqual(false);
    });
  });
});
