import ROMScanner from '../../../src/modules/romScanner.js';
import FileHeader from '../../../src/types/files/fileHeader.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getForName', () => {
  test.each([
    'No-Intro_A7800.xml',
    'No-Intro_LNX.xml',
    'No-Intro_NES.xml',
    'No-Intro_FDS.xml',
  ])('should get a file header for name: %s', (headerName) => {
    const fileHeader = FileHeader.getForName(headerName);
    expect(fileHeader).toBeDefined();
  });

  test.each([
    '',
    '   ',
    '🤷',
  ])('should not get a file header for name: %s', (headerName) => {
    const fileHeader = FileHeader.getForName(headerName);
    expect(fileHeader).toBeUndefined();
  });
});

describe('getForExtension', () => {
  test.each([
    'rom.a78',
    'rom.lnx',
    'rom.nes',
    'rom.fds',
    'rom.zip.fds',
  ])('should get a file header for extension: %s', (filePath) => {
    const fileHeader = FileHeader.getForFilename(filePath);
    expect(fileHeader).toBeDefined();
  });

  test.each([
    '',
    '   ',
    '.nes',
    'rom.zip',
    'rom.nes.zip',
  ])('should not get a file header for extension: %s', (filePath) => {
    const fileHeader = FileHeader.getForFilename(filePath);
    expect(fileHeader).toBeUndefined();
  });
});

describe('getForFile', () => {
  it('should get a file header for headered files', async () => {
    const headeredRoms = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered'],
    }), new ProgressBarFake()).scan();
    expect(headeredRoms).toHaveLength(5);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < headeredRoms.length; i += 1) {
      await headeredRoms[i].extractToFile(async (localFile) => {
        const fileHeader = await FileHeader.getForFileContents(localFile);
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
      await headeredRoms[i].extractToFile(async (localFile) => {
        const fileHeader = await FileHeader.getForFileContents(localFile);
        expect(fileHeader).toBeUndefined();
      });
    }
  });
});
