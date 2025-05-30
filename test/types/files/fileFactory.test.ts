import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

describe('filesFrom', () => {
  describe.each([
    ['test/fixtures/roms/7z/fizzbuzz.7z', 1],
    ['test/fixtures/roms/7z/foobar.7z', 1],
    ['test/fixtures/roms/7z/loremipsum.7z', 1],
    ['test/fixtures/roms/7z/onetwothree.7z', 3],
    ['test/fixtures/roms/7z/unknown.7z', 1],
    ['test/fixtures/roms/gz/fizzbuzz.gz', 1],
    ['test/fixtures/roms/gz/foobar.gz', 1],
    ['test/fixtures/roms/gz/loremipsum.gz', 1],
    ['test/fixtures/roms/gz/one.gz', 1],
    ['test/fixtures/roms/gz/three.gz', 1],
    ['test/fixtures/roms/gz/two.gz', 1],
    ['test/fixtures/roms/gz/unknown.gz', 1],
    ['test/fixtures/roms/nkit/GameCube-240pSuite-1.19.nkit.iso', 1],
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
  ])('%s', (filePath, expectedCount) => {
    it('should read the entries of archives with valid extensions: %s', async () => {
      const archiveEntries = await new FileFactory(new FileCache(), LOGGER).filesFrom(filePath);
      expect(archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry)).toEqual(
        true,
      );
      expect(archiveEntries).toHaveLength(expectedCount);
    });

    it('should read the entries of non-empty archives with junk extensions: %s', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
      await FsPoly.copyFile(filePath, tempFile);
      try {
        const archiveEntries = await new FileFactory(new FileCache(), LOGGER).filesFrom(tempFile);
        expect(
          archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry),
        ).toEqual(true);
        expect(archiveEntries).toHaveLength(expectedCount);
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    });
  });
});
