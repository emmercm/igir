import ROMScanner from '../../../src/modules/romScanner.js';
import FileHeader from '../../../src/types/files/fileHeader.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('headerFromFilename', () => {
  test.each([
    'rom.a78',
    'rom.lnx',
    'rom.nes',
    'rom.fds',
    'rom.smc',
    'rom.zip.fds',
  ])('should get a file header for extension: %s', (filePath) => {
    const fileHeader = FileHeader.headerFromFilename(filePath);
    expect(fileHeader).toBeDefined();
  });

  test.each([
    '',
    '   ',
    '.nes',
    'rom.zip',
    'rom.nes.zip',
  ])('should not get a file header for extension: %s', (filePath) => {
    const fileHeader = FileHeader.headerFromFilename(filePath);
    expect(fileHeader).toBeUndefined();
  });
});

describe('headerFromFileStream', () => {
  it('should get a file header for headered files', async () => {
    const headeredRoms = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered'],
    }), new ProgressBarFake()).scan();
    expect(headeredRoms).toHaveLength(6);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < headeredRoms.length; i += 1) {
      await headeredRoms[i].createReadStream(async (stream) => {
        const fileHeader = await FileHeader.headerFromFileStream(stream);
        expect(fileHeader).toBeDefined();
      });
    }
  });

  it('should not get a file header for dummy files', async () => {
    const headeredRoms = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/!(headered){,/}*'],
    }), new ProgressBarFake()).scan();
    expect(headeredRoms.length).toBeGreaterThan(0);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < headeredRoms.length; i += 1) {
      await headeredRoms[i].createReadStream(async (stream) => {
        const fileHeader = await FileHeader.headerFromFileStream(stream);
        expect(fileHeader).toBeUndefined();
      });
    }
  });
});
