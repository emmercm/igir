import fs from 'fs';

import ROMScanner from '../../../src/modules/romScanner.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import ArchiveFactory from '../../../src/types/files/archiveFactory.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', () => {
    const file = ArchiveFactory.archiveFrom('./test/fixtures/roms/zip/empty.zip');
    expect(file.getFilePath()).toEqual('./test/fixtures/roms/zip/empty.zip');
  });
});

describe('getArchiveEntryPath', () => {
  test.each([
    'something.rom',
    undefined,
  ])('should return the constructor value: %s', (archiveEntryPath) => {
    const file = ArchiveFactory.archiveFrom('./test/fixtures/roms/zip/empty.zip', archiveEntryPath);
    expect(file.getArchiveEntryPath()).toEqual(archiveEntryPath);
  });
});

describe('isZip', () => {
  test.each([
    './test/fixtures/roms/zip/empty.zip',
    './test/fixtures/roms/fizzbuzz.zip',
  ])('should return true when appropriate', (filePath) => {
    const file = ArchiveFactory.archiveFrom(filePath);
    expect(file.isZip()).toEqual(true);
  });

  test.each([
    './test/fixtures/roms/7z/invalid.7z',
    './test/fixtures/roms/loremipsum.7z',
    './test/fixtures/roms/rar/fizzbuzz.rar',
    './test/fixtures/roms/unknown.rar',
  ])('should return false when appropriate', (filePath) => {
    const file = ArchiveFactory.archiveFrom(filePath);
    expect(file.isZip()).toEqual(false);
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
      await zip.extract(temp, (localFile) => {
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
      await rar.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(rar.getFilePath());
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
      await sevenZip.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(sevenZip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should throw an error on unknown archives', async () => {
    expect(() => ArchiveFactory.archiveFrom('image.iso', 'file.rom')).toThrow(/unknown/i);
  });
});

describe('equals', () => {
  it('should be equal itself', async () => {
    const file = ArchiveFactory.archiveFrom('./test/fixtures/roms/zip/loremipsum.zip', undefined);
    await expect(file.equals(file)).resolves.toEqual(true);
  });

  it('should deep equal a raw file', async () => {
    const first = ArchiveFactory.archiveFrom('./test/fixtures/roms/zip/loremipsum.zip', undefined);
    const second = ArchiveFactory.archiveFrom('./test/fixtures/roms/zip/loremipsum.zip', undefined);
    await expect(first.equals(second)).resolves.toEqual(true);
  });
});
