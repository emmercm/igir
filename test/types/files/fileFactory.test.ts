import path from 'node:path';

import Defaults from '../../../src/constants/defaults.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import FileFactory from '../../../src/types/files/fileFactory.js';

describe('filesFrom', () => {
  describe('archives', () => {
    test.each([
      ['test/fixtures/roms/7z/empty.7z', 0],
      ['test/fixtures/roms/7z/fizzbuzz.7z', 1],
      ['test/fixtures/roms/7z/foobar.7z', 1],
      ['test/fixtures/roms/7z/loremipsum.7z', 1],
      ['test/fixtures/roms/7z/onetwothree.7z', 3],
      ['test/fixtures/roms/7z/unknown.7z', 1],
      ['test/fixtures/roms/rar/fizzbuzz.rar', 1],
      ['test/fixtures/roms/rar/foobar.rar', 1],
      ['test/fixtures/roms/rar/loremipsum.rar', 1],
      ['test/fixtures/roms/rar/onetwothree.rar', 3],
      ['test/fixtures/roms/rar/unknown.rar', 1],
      ['test/fixtures/roms/tar/fizzbuzz.tar.gz', 1],
      ['test/fixtures/roms/tar/foobar.tar.gz', 1],
      ['test/fixtures/roms/tar/loremipsum.tar.gz', 1],
      ['test/fixtures/roms/tar/onetwothree.tar.gz', 3],
      ['test/fixtures/roms/tar/unknown.tar.gz', 1],
      ['test/fixtures/roms/zip/empty.zip', 0],
      ['test/fixtures/roms/zip/fizzbuzz.zip', 1],
      ['test/fixtures/roms/zip/foobar.zip', 1],
      ['test/fixtures/roms/zip/fourfive.zip', 2],
      ['test/fixtures/roms/zip/loremipsum.zip', 1],
      ['test/fixtures/roms/zip/onetwothree.zip', 3],
      ['test/fixtures/roms/zip/unknown.zip', 1],
    ])('should read the entries of archives with valid extensions: %s', async (filePath, expectedCount) => {
      const archiveEntries = await FileFactory.filesFrom(filePath);
      expect(archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry))
        .toEqual(true);
      expect(archiveEntries).toHaveLength(expectedCount);
    });

    test.each([
      ['test/fixtures/roms/7z/fizzbuzz.7z', 1],
      ['test/fixtures/roms/7z/foobar.7z', 1],
      ['test/fixtures/roms/7z/loremipsum.7z', 1],
      ['test/fixtures/roms/7z/onetwothree.7z', 3],
      ['test/fixtures/roms/7z/unknown.7z', 1],
      ['test/fixtures/roms/rar/fizzbuzz.rar', 1],
      ['test/fixtures/roms/rar/foobar.rar', 1],
      ['test/fixtures/roms/rar/loremipsum.rar', 1],
      ['test/fixtures/roms/rar/onetwothree.rar', 3],
      ['test/fixtures/roms/rar/unknown.rar', 1],
      ['test/fixtures/roms/tar/fizzbuzz.tar.gz', 1],
      ['test/fixtures/roms/tar/foobar.tar.gz', 1],
      ['test/fixtures/roms/tar/loremipsum.tar.gz', 1],
      ['test/fixtures/roms/tar/onetwothree.tar.gz', 3],
      ['test/fixtures/roms/tar/unknown.tar.gz', 1],
      ['test/fixtures/roms/zip/fizzbuzz.zip', 1],
      ['test/fixtures/roms/zip/foobar.zip', 1],
      ['test/fixtures/roms/zip/fourfive.zip', 2],
      ['test/fixtures/roms/zip/loremipsum.zip', 1],
      ['test/fixtures/roms/zip/onetwothree.zip', 3],
      ['test/fixtures/roms/zip/unknown.zip', 1],
    ])('should read the entries of non-empty archives with junk extensions: %s', async (filePath, expectedCount) => {
      const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'file'));
      await FsPoly.copyFile(filePath, tempFile);
      try {
        const archiveEntries = await FileFactory.filesFrom(tempFile);
        expect(archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry))
          .toEqual(true);
        expect(archiveEntries).toHaveLength(expectedCount);
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    });
  });
});
