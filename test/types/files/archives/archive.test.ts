import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../../src/async/driveSemaphore.js';
import Logger from '../../../../src/console/logger.js';
import { LogLevel } from '../../../../src/console/logLevel.js';
import Temp from '../../../../src/globals/temp.js';
import ROMScanner from '../../../../src/modules/roms/romScanner.js';
import ArrayPoly from '../../../../src/polyfill/arrayPoly.js';
import FsPoly from '../../../../src/polyfill/fsPoly.js';
import Archive from '../../../../src/types/files/archives/archive.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import Chd from '../../../../src/types/files/archives/chd/chd.js';
import Gcz from '../../../../src/types/files/archives/dolphin/gcz.js';
import Rvz from '../../../../src/types/files/archives/dolphin/rvz.js';
import Wia from '../../../../src/types/files/archives/dolphin/wia.js';
import Cso from '../../../../src/types/files/archives/maxcso/cso.js';
import Dax from '../../../../src/types/files/archives/maxcso/dax.js';
import Zso from '../../../../src/types/files/archives/maxcso/zso.js';
import NkitIso from '../../../../src/types/files/archives/nkitIso.js';
import Rar from '../../../../src/types/files/archives/rar.js';
import Gzip from '../../../../src/types/files/archives/sevenZip/gzip.js';
import SevenZip from '../../../../src/types/files/archives/sevenZip/sevenZip.js';
import Z from '../../../../src/types/files/archives/sevenZip/z.js';
import ZipSpanned from '../../../../src/types/files/archives/sevenZip/zipSpanned.js';
import ZipX from '../../../../src/types/files/archives/sevenZip/zipX.js';
import Tar from '../../../../src/types/files/archives/tar.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import FileCache from '../../../../src/types/files/fileCache.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import Options from '../../../../src/types/options.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

describe('getArchiveEntries', () => {
  test.each([
    ...new Set([
      ...Zip.getExtensions(),
      ...Tar.getExtensions(),
      ...Rar.getExtensions(),
      // 7zip
      ...Gzip.getExtensions(),
      ...SevenZip.getExtensions(),
      ...Z.getExtensions(),
      ...ZipSpanned.getExtensions(),
      ...ZipX.getExtensions(),
      // Compressed images
      ...Cso.getExtensions(),
      ...Dax.getExtensions(),
      ...Zso.getExtensions(),
      ...Gcz.getExtensions(),
      ...Rvz.getExtensions(),
      ...Wia.getExtensions(),
      ...Chd.getExtensions(),
      ...NkitIso.getExtensions(),
    ]),
  ])("should throw when the file doesn't exist: %s", async (extension) => {
    const tempFile = (await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'))) + extension;
    await expect(new FileFactory(new FileCache(), LOGGER).filesFrom(tempFile)).rejects.toThrow();
  });

  test.each([
    // fizzbuzz
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/gz/fizzbuzz.gz', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'fizzbuzz.nes', '370517b5'],
    // foobar
    ['./test/fixtures/roms/7z/foobar.7z', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/gz/foobar.gz', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'foobar.lnx', 'b22c9747'],
    // loremipsum
    ['./test/fixtures/roms/7z/loremipsum.7z', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/gz/loremipsum.gz', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'loremipsum.rom', '70856527'],
    // unknown
    ['./test/fixtures/roms/7z/unknown.7z', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/gz/unknown.gz', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/rar/unknown.rar', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/tar/unknown.tar.gz', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/zip/unknown.zip', 'unknown.rom', '377a7727'],
    // other
    [
      './test/fixtures/roms/nkit/GameCube-240pSuite-1.19.nkit.iso',
      'GameCube-240pSuite-1.19.iso',
      '5eb3d183',
    ],
  ])(
    'should enumerate the single file archive: %s',
    async (filePath, expectedEntryPath, expectedCrc) => {
      const entries = await new FileFactory(new FileCache(), LOGGER).filesFrom(filePath);
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect((entry as ArchiveEntry<Archive>).getEntryPath()).toEqual(expectedEntryPath);
      expect(entry.getCrc32()).toEqual(expectedCrc);
    },
  );

  test.each([
    [
      './test/fixtures/roms/7z/onetwothree.7z',
      [
        [path.join('1', 'one.rom'), 'f817a89f'],
        [path.join('2', 'two.rom'), '96170874'],
        [path.join('3', 'three.rom'), 'ff46c5d8'],
      ],
    ],
    [
      './test/fixtures/roms/rar/onetwothree.rar',
      [
        [path.join('1', 'one.rom'), 'f817a89f'],
        [path.join('2', 'two.rom'), '96170874'],
        [path.join('3', 'three.rom'), 'ff46c5d8'],
      ],
    ],
    [
      './test/fixtures/roms/tar/onetwothree.tar.gz',
      [
        [path.join('1', 'one.rom'), 'f817a89f'],
        [path.join('2', 'two.rom'), '96170874'],
        [path.join('3', 'three.rom'), 'ff46c5d8'],
      ],
    ],
    [
      './test/fixtures/roms/zip/onetwothree.zip',
      [
        [path.join('1', 'one.rom'), 'f817a89f'],
        [path.join('2', 'two.rom'), '96170874'],
        [path.join('3', 'three.rom'), 'ff46c5d8'],
      ],
    ],
  ])('should enumerate the multi file archive: %s', async (filePath, expectedEntries) => {
    const entries = await new FileFactory(new FileCache(), LOGGER).filesFrom(filePath);
    expect(entries).toHaveLength(expectedEntries.length);

    for (const [idx, entry] of entries.entries()) {
      const expectedEntry = expectedEntries[idx];
      expect((entry as ArchiveEntry<Archive>).getEntryPath()).toEqual(expectedEntry[0]);
      expect(entry.getCrc32()).toEqual(expectedEntry[1]);
    }
  });
});

describe('extractEntryToFile', () => {
  it('should throw on invalid entry paths', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(
      new Options({
        input: [
          './test/fixtures/roms/7z',
          './test/fixtures/roms/gz',
          './test/fixtures/roms/rar',
          './test/fixtures/roms/tar',
          './test/fixtures/roms/zip',
        ],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(os.cpus().length),
    ).scan();
    const archives = archiveEntries
      .filter((entry) => entry instanceof ArchiveEntry)
      .map((entry) => entry.getArchive())
      .reduce(ArrayPoly.reduceUnique(), []);
    expect(archives).toHaveLength(28);

    for (const archive of archives) {
      await expect(archive.extractEntryToFile('INVALID FILE', 'INVALID PATH')).rejects.toThrow();
    }
  });
});
