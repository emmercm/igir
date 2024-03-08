import path from 'node:path';

import Constants from '../../../../src/constants.js';
import ROMScanner from '../../../../src/modules/romScanner.js';
import fsPoly from '../../../../src/polyfill/fsPoly.js';
import Archive from '../../../../src/types/files/archives/archive.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import Rar from '../../../../src/types/files/archives/rar.js';
import SevenZip from '../../../../src/types/files/archives/sevenZip.js';
import Tar from '../../../../src/types/files/archives/tar.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import Options from '../../../../src/types/options.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

describe('getArchiveEntries', () => {
  test.each([...new Set([
    ...Zip.SUPPORTED_EXTENSIONS,
    ...Tar.SUPPORTED_EXTENSIONS,
    ...Rar.SUPPORTED_EXTENSIONS,
    ...SevenZip.SUPPORTED_EXTENSIONS,
  ])])('should throw when the file doesn\'t exist: %s', async (extension) => {
    const tempFile = (await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'))) + extension;
    await expect(FileFactory.filesFrom(tempFile)).rejects.toThrow();
  });

  test.each([
    // fizzbuzz
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'fizzbuzz.nes', '370517b5'],
    // foobar
    ['./test/fixtures/roms/7z/foobar.7z', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'foobar.lnx', 'b22c9747'],
    // loremipsum
    ['./test/fixtures/roms/7z/loremipsum.7z', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'loremipsum.rom', '70856527'],
    // unknown
    ['./test/fixtures/roms/7z/unknown.7z', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/rar/unknown.rar', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/tar/unknown.tar.gz', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/zip/unknown.zip', 'unknown.rom', '377a7727'],
  ])('should enumerate the single file archive: %s', async (filePath, expectedEntryPath, expectedCrc) => {
    const entries = await FileFactory.filesFrom(filePath);
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect((entry as ArchiveEntry<Archive>).getEntryPath()).toEqual(expectedEntryPath);
    expect(entry.getCrc32()).toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/7z/onetwothree.7z', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
    ['./test/fixtures/roms/rar/onetwothree.rar', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
    ['./test/fixtures/roms/tar/onetwothree.tar.gz', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
    ['./test/fixtures/roms/zip/onetwothree.zip', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
  ])('should enumerate the multi file archive: %s', async (filePath, expectedEntries) => {
    const entries = await FileFactory.filesFrom(filePath);
    expect(entries).toHaveLength(expectedEntries.length);

    for (const [idx, entry] of entries.entries()) {
      const expectedEntry = expectedEntries[idx];
      expect((entry as ArchiveEntry<Archive>).getEntryPath())
        .toEqual(path.normalize(expectedEntry[0]));
      expect(entry.getCrc32()).toEqual(expectedEntry[1]);
    }
  });
});

describe('asRawFile', () => {
  test.each([
    'test/fixtures/roms/7z',
    'test/fixtures/roms/rar',
    'test/fixtures/roms/tar',
    'test/fixtures/roms/zip',
  ])('should calculate raw file', async (input) => {
    // Given some files
    const options = new Options({ input: [input] });
    const files = await new ROMScanner(options, new ProgressBarFake()).scan();

    for (const file of files) {
      expect(file).toBeInstanceOf(ArchiveEntry);

      // When getting the raw file
      const rawFile = await ((file as ArchiveEntry<never>).getArchive() as Archive).asRawFile();

      // Then it should have a size and a real CRC
      expect(rawFile.getSize()).toBeGreaterThan(0);
      expect(rawFile.getCrc32()).not.toEqual('00000000');
      expect(rawFile.getCrc32WithoutHeader()).not.toEqual('00000000');
    }
  });
});

describe('asRawFileWithoutCrc', () => {
  test.each([
    'test/fixtures/roms/7z',
    'test/fixtures/roms/rar',
    'test/fixtures/roms/tar',
    'test/fixtures/roms/zip',
  ])('should calculate raw file', async (input) => {
    // Given some files
    const options = new Options({ input: [input] });
    const files = await new ROMScanner(options, new ProgressBarFake()).scan();

    for (const file of files) {
      expect(file).toBeInstanceOf(ArchiveEntry);

      // When getting the raw file
      const rawFile = await ((file as ArchiveEntry<never>).getArchive() as Archive)
        .asRawFileWithoutCrc();

      // Then it should have a size and a dummy CRC
      expect(rawFile.getSize()).toBeGreaterThan(0);
      expect(rawFile.getCrc32()).toEqual('00000000');
      expect(rawFile.getCrc32WithoutHeader()).toEqual('00000000');
    }
  });
});
