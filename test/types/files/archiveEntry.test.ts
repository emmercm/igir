import fs from 'fs';

import ROMScanner from '../../../src/modules/romScanner.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../src/types/files/archiveEntry.js';
import ArchiveFactory from '../../../src/types/files/archiveFactory.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getEntryPath', () => {
  test.each([
    'something.rom',
    'foo/bar.rom',
  ])('should return the constructor value: %s', (archiveEntryPath) => {
    const archive = ArchiveFactory.archiveFrom('/some/archive.zip');
    const archiveEntry = new ArchiveEntry(archive, archiveEntryPath);
    expect(archiveEntry.getEntryPath()).toEqual(archiveEntryPath);
  });
});

describe('extract', () => {
  it('should extract zip files', async () => {
    // Note: this will only return valid zips with at least one file
    const zips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/zip'],
    }), new ProgressBarFake()).scan();
    expect(zips).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < zips.length; i += 1) {
      const zip = zips[i];
      await zip.extract((localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(zip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract rar files', async () => {
    // Note: this will only return valid rars with at least one file
    const rars = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/rar'],
    }), new ProgressBarFake()).scan();
    expect(rars).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < rars.length; i += 1) {
      const rar = rars[i];
      await rar.extract((localFile) => {
        expect(fs.existsSync(localFile))
          .toEqual(true);
        expect(localFile)
          .not
          .toEqual(rar.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract 7z files', async () => {
    // Note: this will only return valid 7z's with at least one file
    const sevenZips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/7z'],
    }), new ProgressBarFake()).scan();
    expect(sevenZips).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < sevenZips.length; i += 1) {
      const sevenZip = sevenZips[i];
      await sevenZip.extract((localFile) => {
        expect(fs.existsSync(localFile))
          .toEqual(true);
        expect(localFile)
          .not
          .toEqual(sevenZip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should throw an error on unknown archives', async () => {
    expect(() => ArchiveFactory.archiveFrom('image.iso')).toThrow(/unknown/i);
  });
});
