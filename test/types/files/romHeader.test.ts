import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

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
      new FileFactory(new FileCache()),
    ).scan();
    expect(headeredRoms).toHaveLength(6);

    for (const headeredRom of headeredRoms) {
      await headeredRom.createReadStream(async (stream) => {
        const fileHeader = await ROMHeader.headerFromFileStream(stream);
        expect(fileHeader).toBeDefined();
        expect(fileHeader?.getName()).toBeTruthy();
      });
    }
  });

  it('should not get a file header for dummy files', async () => {
    const headeredRoms = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/!(headered){,/}*'],
        inputExclude: ['./test/fixtures/roms/chd', './test/fixtures/roms/nkit'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
    ).scan();
    expect(headeredRoms.length).toBeGreaterThan(0);

    for (const headeredRom of headeredRoms) {
      await headeredRom.createReadStream(async (stream) => {
        const fileHeader = await ROMHeader.headerFromFileStream(stream);
        expect(fileHeader).toBeUndefined();
      });
    }
  });
});
