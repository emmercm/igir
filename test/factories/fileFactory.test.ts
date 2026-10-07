import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import FileFactory from '../../src/factories/fileFactory.js';
import Temp from '../../src/globals/temp.js';
import type Archive from '../../src/models/files/archives/archive.js';
import ArchiveEntry from '../../src/models/files/archives/archiveEntry.js';
import Bzip2 from '../../src/models/files/archives/sevenZip/bzip2.js';
import Tar from '../../src/models/files/archives/tar.js';
import Zip from '../../src/models/files/archives/zip.js';
import FsUtil from '../../src/utils/fsUtil.js';

type ArchiveClass = new (filePath: string) => Archive;

describe('filesFrom', () => {
  describe.each([
    ['test/fixtures/roms/7z/fizzbuzz.7z', 1],
    ['test/fixtures/roms/7z/foobar.7z', 1],
    ['test/fixtures/roms/7z/loremipsum.7z', 1],
    ['test/fixtures/roms/7z/onetwothree.7z', 3],
    ['test/fixtures/roms/7z/unknown.7z', 1],
    ['test/fixtures/roms/bz2/fizzbuzz.bz2', 1],
    ['test/fixtures/roms/bz2/foobar.bz2', 1],
    ['test/fixtures/roms/bz2/loremipsum.bz2', 1],
    ['test/fixtures/roms/bz2/one.bz2', 1],
    ['test/fixtures/roms/bz2/three.bz2', 1],
    ['test/fixtures/roms/bz2/two.bz2', 1],
    ['test/fixtures/roms/bz2/unknown.bz2', 1],
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
      const archiveEntries = await new FileFactory(new FileCache()).filesFrom(filePath);
      expect(archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry)).toEqual(
        true,
      );
      expect(archiveEntries).toHaveLength(expectedCount);
    });

    it('should read the entries of non-empty archives with junk extensions: %s', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsUtil.mkdir(path.dirname(tempFile), { recursive: true });
      await FsUtil.copyFile(filePath, tempFile);
      try {
        const archiveEntries = await new FileFactory(new FileCache()).filesFrom(tempFile);
        expect(
          archiveEntries.every((archiveEntry) => archiveEntry instanceof ArchiveEntry),
        ).toEqual(true);
        expect(archiveEntries).toHaveLength(expectedCount);
      } finally {
        await FsUtil.rm(tempFile, { force: true });
      }
    });
  });

  test.each([
    ...['.apk', '.ipa', '.jar', '.pk3', '.zip64'].map(
      (extension): [string, string, ArchiveClass] => [
        'test/fixtures/roms/zip/onetwothree.zip',
        extension,
        Zip,
      ],
    ),
    ...['.ova', '.tgz', '.tpz'].map((extension): [string, string, ArchiveClass] => [
      'test/fixtures/roms/tar/onetwothree.tar.gz',
      extension,
      Tar,
    ]),
    ...['.bzip2', '.tbz', '.tbz2'].map((extension): [string, string, ArchiveClass] => [
      'test/fixtures/roms/bz2/one.bz2',
      extension,
      Bzip2,
    ]),
  ])(
    'should read archives by their alternate extensions: %s as %s',
    async (filePath, extension, expectedArchiveClass) => {
      const tempDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dir'));
      const tempFile = path.join(tempDir, `file${extension}`);
      await FsUtil.mkdir(tempDir, { recursive: true });
      await FsUtil.copyFile(filePath, tempFile);
      try {
        const archiveEntries = await new FileFactory(new FileCache()).filesFrom(tempFile);
        const expectedCount = (await new FileFactory(new FileCache()).filesFrom(filePath)).length;
        expect(archiveEntries).toHaveLength(expectedCount);
        for (const archiveEntry of archiveEntries) {
          expect(archiveEntry).toBeInstanceOf(ArchiveEntry);
          if (archiveEntry instanceof ArchiveEntry) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect(archiveEntry.getArchive()).toBeInstanceOf(expectedArchiveClass);
          }
        }
      } finally {
        await FsUtil.rm(tempDir, { force: true, recursive: true });
      }
    },
  );
});
