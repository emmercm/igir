import fs from 'fs';

import ROMScanner from '../../../src/modules/romScanner.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import ArchiveFactory from '../../../src/types/archives/archiveFactory.js';
import SevenZip from '../../../src/types/archives/sevenZip.js';
import Zip from '../../../src/types/archives/zip.js';
import ArchiveEntry from '../../../src/types/files/archiveEntry.js';
import FileHeader from '../../../src/types/files/fileHeader.js';
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

describe('getCrc32', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '370517b5'],
    ['./test/fixtures/roms/7z/foobar.7z', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'b22c9747'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '70856527'],
  ])('should hash the archive entry: %s', async (filePath, expectedCrc) => {
    const archive = ArchiveFactory.archiveFrom(filePath);

    const archiveEntries = await archive.getArchiveEntries();
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    await expect(archiveEntry.getCrc32()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'a1eaa7c1'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '3ecbac61'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '42583855'],
  ])('should hash the headered archive entry: %s', async (filePath, expectedCrc) => {
    const archive = ArchiveFactory.archiveFrom(filePath);

    const archiveEntries = await archive.getArchiveEntries();
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    await expect(archiveEntry.getCrc32()).resolves.not.toEqual(expectedCrc);

    const fileHeader = FileHeader.getForFilename(archiveEntry.getExtractedFilePath());
    expect(fileHeader).toBeTruthy();
    const headeredArchiveEntry = archiveEntry.withFileHeader(fileHeader as FileHeader);

    await expect(headeredArchiveEntry.getCrc32()).resolves.toEqual(expectedCrc);
  });
});

describe('extract', () => {
  it('should extract archived files', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(new Options({
      input: [
        './test/fixtures/roms/zip',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/7z',
      ],
    }), new ProgressBarFake()).scan();
    expect(archiveEntries).toHaveLength(12);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < archiveEntries.length; i += 1) {
      const zip = archiveEntries[i];
      await zip.extract((localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(zip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should throw an error on unknown archives', async () => {
    expect(() => ArchiveFactory.archiveFrom('image.iso')).toThrow(/unknown/i);
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const entry = new ArchiveEntry(new Zip('file.zip'), 'entry.rom', '00000000');
    await expect(entry.equals(entry)).resolves.toEqual(true);
  });

  it('should equal the same entry', async () => {
    const first = new ArchiveEntry(new Zip('file.zip'), 'entry.rom', '00000000');
    const second = new ArchiveEntry(new Zip('file.zip'), 'entry.rom', '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
    await expect(second.equals(first)).resolves.toEqual(true);
  });

  it('should not equal a different entry', async () => {
    const first = new ArchiveEntry(new Zip('file.zip'), 'entry.rom', '00000000');
    const second = new ArchiveEntry(new SevenZip('file.7z'), 'entry.rom', '00000000');
    const third = new ArchiveEntry(new Zip('file.zip'), 'other.rom', '00000000');
    const fourth = new ArchiveEntry(new Zip('file.zip'), 'entry.rom', '12345678');
    await expect(first.equals(second)).resolves.toEqual(false);
    await expect(second.equals(third)).resolves.toEqual(false);
    await expect(third.equals(fourth)).resolves.toEqual(false);
    await expect(fourth.equals(first)).resolves.toEqual(false);
  });
});
