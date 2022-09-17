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
    expect(fileHeader).not.toBeUndefined();
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
    '.a78',
    '.A78',
    '.lnx',
    '.LnX',
    '.nes',
    '.nEs',
    '.fds',
    '.FDS',
  ])('should get a file header for extension: %s', (extension) => {
    const fileHeader = FileHeader.getForExtension(extension);
    expect(fileHeader).not.toBeUndefined();
  });

  test.each([
    '',
    '   ',
    '.zip',
    '.nes.zip',
  ])('should not get a file header for extension: %s', (extension) => {
    const fileHeader = FileHeader.getForExtension(extension);
    expect(fileHeader).toBeUndefined();
  });
});

describe('getForFile', () => {
  it('should get a file header for headered files', async () => {
    const headeredRoms = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered'],
    }), new ProgressBarFake()).scan();
    expect(headeredRoms).toHaveLength(4);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < headeredRoms.length; i += 1) {
      await headeredRoms[i].extract(async (localFile) => {
        const fileHeader = await FileHeader.getForFile(localFile);
        expect(fileHeader).not.toBeUndefined();
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
      await headeredRoms[i].extract(async (localFile) => {
        const fileHeader = await FileHeader.getForFile(localFile);
        expect(fileHeader).toBeUndefined();
      });
    }
  });
});
