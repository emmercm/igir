import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import url from 'node:url';
import util from 'node:util';

import Temp from '../../../src/globals/temp.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import FileChecksums, { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import { CompressionMethodValue } from '../src/fileRecord.js';
import ZipReader from '../src/zipReader.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const fixtures = (await FsPoly.walk(dirname)).filter((filePath) => !filePath.endsWith('.ts'));

describe('entries', () => {
  const emptyFixtures = fixtures.filter((filePath) => path.basename(filePath) === 'empty.zip');
  const nonEmptyFixtures = fixtures.filter((filePath) => !emptyFixtures.includes(filePath));

  test.each(emptyFixtures)('empty: %s', async (filePath) => {
    const entries = await new ZipReader(filePath).centralDirectoryFileHeaders();
    expect(entries).toHaveLength(0);
  });

  const expected = new Map<
    string,
    [number, CompressionMethodValue, number, string, string, string, string][]
  >([
    [
      path.join('libziparchive', 'declaredlength.zip'),
      [
        [0, 0, 0, '2012-10-03T09:16:30.000Z', '00000000', 'ani4/', ''],
        [0, 0, 0, '2012-06-21T09:09:52.000Z', '00000000', 'ani5/', ''],
        [0, 0, 0, '2014-08-26T08:02:49.137Z', '00000000', 'black/', ''],
        [
          0,
          0,
          0,
          new Date('2015-03-13T13:31:58.000').toISOString(),
          '00000000',
          'black/00001.jpg',
          '',
        ],
        [0, 0, 0, '2014-08-26T08:03:33.489Z', '00000000', 'generic1/', ''],
        [0, 0, 0, '2014-08-26T08:02:49.230Z', '00000000', 'generic2/', ''],
        [0, 0, 0, '2014-08-26T08:02:49.558Z', '00000000', 'generic3/', ''],
      ],
    ],
    [
      path.join('libziparchive', 'dummy-update.zip'),
      [
        [0, 0, 0, '2011-06-28T20:06:53.000Z', '00000000', 'META-INF/com/android/metadata', ''],
        [
          304_100,
          8,
          195_384,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          'b6736c81',
          'META-INF/com/google/android/update-binary',
          '',
        ],
        [
          35,
          8,
          33,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          '3f85229c',
          'META-INF/com/google/android/updater-script',
          '',
        ],
        [
          888_795,
          8,
          889_070,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          '5635625f',
          'filler.dat',
          '',
        ],
        [
          394,
          8,
          253,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          '2c590837',
          'META-INF/MANIFEST.MF',
          '',
        ],
        [
          447,
          8,
          283,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          '173838ea',
          'META-INF/CERT.SF',
          '',
        ],
        [
          1714,
          8,
          1156,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          '526a227f',
          'META-INF/CERT.RSA',
          '',
        ],
        [
          1675,
          8,
          944,
          new Date('2011-09-19T14:06:42.000').toISOString(),
          'c4c94ebc',
          'META-INF/com/android/otacert',
          '',
        ],
      ],
    ],
    [path.join('libziparchive', 'empty.zip'), []],
    [
      path.join('libziparchive', 'large.zip'),
      [
        [788_890, 8, 215_330, '2015-11-10T22:49:17.000Z', 'e7c71763', 'compress.txt', ''],
        [100_000, 0, 100_000, '2015-11-10T22:49:17.000Z', 'f5643627', 'uncompress.txt', ''],
      ],
    ],
    [
      path.join('libziparchive', 'valid.zip'),
      [
        [17, 8, 13, '2013-12-10T16:00:09.000Z', '950821c5', 'a.txt', ''],
        [0, 0, 0, '2013-12-10T16:00:34.000Z', '00000000', 'b/', ''],
        [9, 0, 9, '2013-12-10T16:00:17.000Z', '5912b84d', 'b.txt', ''],
        [9, 0, 9, '2013-12-10T16:00:34.000Z', '5912b84d', 'b/d.txt', ''],
        [17, 8, 13, '2013-12-10T16:00:28.000Z', '950821c5', 'b/c.txt', ''],
      ],
    ],
    [
      path.join('libziparchive', 'zero-size-cd.zip'),
      [[0, 0, 0, '2019-12-16T21:49:30.000Z', '00000000', 'a', '']],
    ],
    [
      path.join('libziparchive', 'zip64.zip'),
      [[4, 0, 4, new Date('2020-03-30T22:31:20.000').toISOString(), '5a82fd08', '-', '']],
    ],
    [
      path.join('yauzl', 'cygwin-info-zip.zip'),
      [
        [5, 0, 5, '2014-08-18T16:30:53.000Z', '8756e051', 'a.txt', ''],
        [5, 0, 5, '2014-08-18T16:30:53.000Z', 'c0f69a81', 'b.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'deflate.zip'),
      [[10_689, 8, 2827, '2014-08-20T08:08:53.000Z', '12880419', 'index.js', '']],
    ],
    [
      path.join('yauzl', 'directories.zip'),
      [
        [0, 0, 0, '2014-08-23T04:47:08.000Z', '00000000', 'a/', ''],
        [0, 0, 0, '2014-08-23T04:47:08.000Z', '00000000', 'a/a.txt', ''],
        [0, 0, 0, '2014-08-23T06:24:47.000Z', '00000000', 'b/', ''],
      ],
    ],
    [path.join('yauzl', 'empty.zip'), []],
    [
      path.join('yauzl', 'linux-info-zip.zip'),
      [
        [5, 0, 5, '2014-08-18T16:30:54.000Z', '8756e051', 'a.txt', ''],
        [5, 0, 5, '2014-08-18T16:30:54.000Z', 'c0f69a81', 'b.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'sloppy-filenames.zip'),
      [
        [5, 0, 5, '2014-08-18T16:30:54.000Z', '8756e051', 'a\\txt', ''],
        [5, 0, 5, '2014-08-18T16:30:54.000Z', 'c0f69a81', 'b.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'streaming.zip'),
      [
        [25, 8, 8, '2025-03-03T11:29:43.000Z', '4fc8b8b2', 'test1.txt', ''],
        [25, 8, 8, '2025-03-03T11:29:50.000Z', 'ce20b234', 'test2.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'traditional-encryption.zip'),
      [[6, 0, 6, '2017-04-19T00:15:54.000Z', '363a3020', 'a.txt', '']],
    ],
    [
      path.join('yauzl', 'traditional-encryption-and-compression.zip'),
      [[1000, 8, 11, '2017-04-19T01:37:45.000Z', '060b1780', 'a.bin', '']],
    ],
    [
      path.join('yauzl', 'unicode.zip'),
      [
        [0, 0, 0, '2014-08-28T08:35:52.000Z', '00000000', 'Turmion Kätilöt/', ''],
        [0, 0, 0, '2014-08-28T08:34:09.000Z', '00000000', 'Turmion Kätilöt/Hoitovirhe/', ''],
        [
          0,
          0,
          0,
          '2014-08-28T08:36:32.000Z',
          '00000000',
          'Turmion Kätilöt/Hoitovirhe/Rautaketju.mp3',
          '',
        ],
        [0, 0, 0, '2014-08-28T08:37:04.000Z', '00000000', 'Turmion Kätilöt/Pirun nyrkki/', ''],
        [
          0,
          0,
          0,
          '2014-08-28T08:36:41.000Z',
          '00000000',
          'Turmion Kätilöt/Pirun nyrkki/Mistä veri pakenee.mp3',
          '',
        ],
      ],
    ],
    [
      path.join('yauzl', 'unicode-path-extra-field.zip'),
      [
        [
          0,
          0,
          0,
          new Date('2016-06-14T18:01:10.000').toISOString(),
          '00000000',
          '七个房间.txt',
          '',
        ],
      ],
    ],
    [
      path.join('yauzl', 'unix-epoch.zip'),
      [[0, 0, 0, '1970-01-01T00:00:00.000Z', '00000000', 'unix-epoch.txt', '']],
    ],
    [
      path.join('yauzl', 'windows-7-zip.zip'),
      [
        [5, 0, 5, '2014-08-18T16:30:53.219Z', '8756e051', 'a.txt', ''],
        [5, 0, 5, '2014-08-18T16:30:53.226Z', 'c0f69a81', 'b.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'windows-compressed-folder.zip'),
      [
        [5, 0, 5, new Date('2014-08-18T09:30:54.000').toISOString(), '8756e051', 'a.txt', ''],
        [5, 0, 5, new Date('2014-08-18T09:30:54.000').toISOString(), 'c0f69a81', 'b.txt', ''],
      ],
    ],
    [
      path.join('yauzl', 'zip64.zip'),
      [
        [3, 8, 5, new Date('2016-08-11T15:45:14.000').toISOString(), '8c736521', 'test1.txt', ''],
        [3, 8, 5, new Date('2016-08-11T15:45:30.000').toISOString(), '76ff8caa', 'test2.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'chunk-boundary.zip'),
      [
        [0, 0, 0, '2018-09-22T17:14:40.000Z', '00000000', 'chunk-boundary-archive/', ''],
        [
          486,
          8,
          397,
          '2018-09-22T17:19:04.000Z',
          '54a65dca',
          'chunk-boundary-archive/chunk-boundary.txt',
          '',
        ],
        [
          6148,
          8,
          235,
          '2018-09-22T13:26:55.000Z',
          '9e541964',
          'chunk-boundary-archive/.DS_Store',
          '',
        ],
        [0, 0, 0, '2018-09-22T17:19:17.000Z', '00000000', '__MACOSX/', ''],
        [0, 0, 0, '2018-09-22T17:19:17.000Z', '00000000', '__MACOSX/chunk-boundary-archive/', ''],
        [
          120,
          8,
          53,
          '2018-09-22T13:26:55.000Z',
          '38c0880b',
          '__MACOSX/chunk-boundary-archive/._.DS_Store',
          '',
        ],
        [
          568,
          8,
          458,
          '2018-09-22T17:14:42.000Z',
          'eb4518be',
          'chunk-boundary-archive/chunk-boundary2.txt',
          '',
        ],
      ],
    ],
    [
      path.join('unzipper', 'compressed-OSX-Finder.zip'),
      [
        [0, 0, 0, '2013-02-03T18:21:06.000Z', '00000000', 'dir/', ''],
        [3, 8, 5, '2013-02-03T18:21:06.000Z', 'd1862931', 'dir/fileInsideDir.txt', ''],
        [2712, 8, 1161, '2013-02-03T18:21:06.000Z', '97a7ed7a', 'file.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'compressed-comment.zip'),
      [
        [15, 8, 17, '2020-05-26T19:32:08.193Z', '4d372318', 'file.txt', ''],
        [0, 0, 0, '2020-05-26T19:32:08.193Z', '00000000', 'dir/', ''],
        [4, 8, 6, '2020-05-26T19:32:08.193Z', '2c991647', 'dir/fileInsideDir.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'compressed-cp866.zip'),
      [[13, 0, 13, '2019-01-03T08:42:47.853Z', 'f77a2052', 'ÆÑßΓ.txt', '']],
    ],
    [
      path.join('unzipper', 'compressed-directory-entry.zip'),
      [
        [20, 0, 20, new Date('2018-03-27T16:29:52.000').toISOString(), '2cab616f', 'mimetype', ''],
        [0, 8, 2, new Date('2018-03-27T16:29:52.000').toISOString(), '00000000', 'META-INF/', ''],
        [
          244,
          8,
          154,
          new Date('2018-03-27T16:29:52.000').toISOString(),
          '74069f90',
          'META-INF/container.xml',
          '',
        ],
        [
          58,
          8,
          42,
          new Date('2018-03-27T16:29:52.000').toISOString(),
          '08765cc3',
          'page_styles.css',
          '',
        ],
        [670, 8, 364, new Date('2018-03-27T16:29:52.000').toISOString(), '1c517816', 'toc.ncx', ''],
        [
          654,
          8,
          368,
          new Date('2018-03-27T16:29:52.000').toISOString(),
          '9fa5bb03',
          'index.html',
          '',
        ],
        [
          174,
          8,
          101,
          new Date('2018-03-27T16:29:52.000').toISOString(),
          '3c58138e',
          'stylesheet.css',
          '',
        ],
        [
          1264,
          8,
          607,
          new Date('2018-03-27T16:29:52.000').toISOString(),
          'e76dd43d',
          'content.opf',
          '',
        ],
      ],
    ],
    [
      path.join('unzipper', 'compressed-encrypted.zip'),
      [
        [0, 0, 0, '2017-01-23T00:00:36.000Z', '00000000', 'dir/', ''],
        [3, 0, 3, '2017-01-23T00:00:36.000Z', 'd1862931', 'dir/fileInsideDir.txt', ''],
        [2712, 8, 1161, '2017-01-23T00:00:36.000Z', '97a7ed7a', 'file.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'compressed-flags-set.zip'),
      [
        [0, 0, 0, '2012-08-08T15:18:09.000Z', '00000000', 'dir/', ''],
        [3, 0, 3, '2012-08-08T15:18:09.000Z', 'd1862931', 'dir/fileInsideDir.txt', ''],
        [2712, 8, 1161, '2012-08-08T15:21:09.000Z', '97a7ed7a', 'file.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'compressed-standard-archive.zip'),
      [
        [0, 0, 0, '2012-08-08T15:18:09.000Z', '00000000', 'dir/', ''],
        [3, 0, 3, '2012-08-08T15:18:09.000Z', 'd1862931', 'dir/fileInsideDir.txt', ''],
        [2712, 8, 1161, '2012-08-08T15:21:09.000Z', '97a7ed7a', 'file.txt', ''],
        [0, 0, 0, '2024-06-08T15:48:43.000Z', '00000000', 'emptydir/', ''],
        [0, 0, 0, '2024-06-08T15:48:53.000Z', '00000000', 'emptyroot/', ''],
        [0, 0, 0, '2024-06-08T15:48:53.000Z', '00000000', 'emptyroot/emptydir/', ''],
      ],
    ],
    [
      path.join('unzipper', 'uncompressed.zip'),
      [
        [0, 0, 0, '2012-08-08T15:18:09.000Z', '00000000', 'dir/', ''],
        [3, 0, 3, '2012-08-08T15:18:09.000Z', 'd1862931', 'dir/fileInsideDir.txt', ''],
        [14, 0, 14, '2012-08-08T15:18:21.000Z', '144ca5ef', 'file.txt', ''],
      ],
    ],
    [
      path.join('unzipper', 'zip-slip-win.zip'),
      [
        [19, 0, 19, '2018-04-15T19:04:29.000Z', 'f34f6f0f', 'good.txt', ''],
        [
          20,
          0,
          20,
          new Date('2018-04-15T22:04:42.000').toISOString(),
          '397b4160',
          '..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\Temp\\evil.txt',
          '',
        ],
      ],
    ],
    [
      path.join('unzipper', 'zip-slip.zip'),
      [
        [19, 0, 19, '2018-04-15T19:04:29.000Z', 'f34f6f0f', 'good.txt', ''],
        [
          20,
          0,
          20,
          new Date('2018-04-15T22:04:42.000').toISOString(),
          '397b4160',
          '../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../tmp/evil.txt',
          '',
        ],
      ],
    ],
    [
      path.join('unzipper', 'zip64-allextrafields.zip'),
      [[36, 8, 36, new Date('2012-08-10T14:33:32.000').toISOString(), '69ffe77e', 'README', '']],
    ],
    [
      path.join('unzipper', 'zip64-extrafieldoffsetlength.zip'),
      [[36, 8, 36, new Date('2012-08-10T14:33:32.000').toISOString(), '69ffe77e', 'README', '']],
    ],
    [
      path.join('unzipper', 'zip64.zip'),
      [[36, 8, 36, new Date('2012-08-10T14:33:32.000').toISOString(), '69ffe77e', 'README', '']],
    ],
    [
      path.join('zstd', '1kb-zstd1.5.5-level16.zip'),
      [[1369, 93, 1079, '2025-04-15T03:10:54.000Z', '1b4fea72', '1kb', '']],
    ],
    [
      path.join('zstd', '1kb-zstd1.5.7-level19.zip'),
      [[1369, 93, 1079, '2025-04-15T03:10:54.000Z', '1b4fea72', '1kb', '']],
    ],
    [
      path.join('zstd', '2kb-zstd1.5.5-level17.zip'),
      [[2733, 93, 2099, '2025-04-15T03:11:00.000Z', 'd16564f3', '2kb', '']],
    ],
    [
      path.join('zstd', '2kb-zstd1.5.7-level20.zip'),
      [[2733, 93, 2099, '2025-04-15T03:11:00.000Z', 'd16564f3', '2kb', '']],
    ],
    [
      path.join('zstd', '3kb-zstd1.5.5-level18.zip'),
      [[4097, 93, 3124, '2025-04-15T03:13:41.000Z', 'e674ff24', '3kb', '']],
    ],
    [
      path.join('zstd', '3kb-zstd1.5.7-level21.zip'),
      [[4097, 93, 3124, '2025-04-15T03:13:41.000Z', 'e674ff24', '3kb', '']],
    ],
    [
      path.join('zstd', '4kb-zstd1.5.5-level19.zip'),
      [[5465, 93, 4153, '2025-04-15T03:13:49.000Z', '2e638652', '4kb', '']],
    ],
    [
      path.join('zstd', '4kb-zstd1.5.7-level22.zip'),
      [[5465, 93, 4153, '2025-04-15T03:13:49.000Z', '2e638652', '4kb', '']],
    ],
  ]);

  test.each(nonEmptyFixtures)('non-empty: %s', async (filePath) => {
    const entries = await new ZipReader(filePath).centralDirectoryFileHeaders();
    expect(entries.length).toBeGreaterThan(0);

    expect(
      entries.map((entry) => [
        // `unzip -v` output
        entry.uncompressedSizeResolved(),
        entry.compressionMethod,
        entry.compressedSizeResolved(),
        entry.fileModificationResolved().toISOString(),
        entry.uncompressedCrc32String(),
        entry.fileNameResolved(),
        entry.fileCommentResolved(),
      ]),
    ).toEqual(expected.get(filePath.replace(dirname, '')));

    /* eslint-disable jest/no-conditional-expect */
    for (const entry of entries) {
      expect(entry.uncompressedCrc32String()).toHaveLength(8);

      // Directory
      if (entry.isDirectory()) {
        expect(entry.uncompressedCrc32String()).toEqual('00000000');
        expect(entry.uncompressedSizeResolved()).toEqual(0);
      }

      // Empty file
      if (entry.compressedSizeResolved() === 0) {
        expect(entry.uncompressedSizeResolved()).toEqual(0);
        expect(entry.uncompressedCrc32String()).toEqual('00000000');
      }

      expect(entry.fileNameResolved()).not.toEqual('');
    }
  });
});

describe('compressedStream', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const zip = new ZipReader(filePath);
    const entries = await zip.centralDirectoryFileHeaders();

    if (!(await FsPoly.exists(Temp.getTempDir()))) {
      await FsPoly.mkdir(Temp.getTempDir());
    }

    for (const entry of entries.filter(
      (entry) =>
        !entry.isDirectory() && !entry.isEncrypted() && entry.compressedSizeResolved() < 10_485_760, // 10MiB
    )) {
      // Write compressed bytes to file
      const tempFile = await FsPoly.mktemp(
        path.join(Temp.getTempDir(), path.basename(entry.fileNameResolved())),
      );

      try {
        await util.promisify(stream.pipeline)(
          await entry.compressedStream(),
          fs.createWriteStream(tempFile),
        );

        await expect(FsPoly.size(tempFile)).resolves.toEqual(entry.compressedSizeResolved());
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    }
  });
});

describe('uncompressedStream', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const zip = new ZipReader(filePath);
    const entries = await zip.centralDirectoryFileHeaders();

    if (!(await FsPoly.exists(Temp.getTempDir()))) {
      await FsPoly.mkdir(Temp.getTempDir());
    }

    for (const entry of entries.filter(
      (entry) =>
        !entry.isDirectory() && !entry.isEncrypted() && entry.compressedSizeResolved() < 10_485_760, // 10MiB
    )) {
      // Write compressed bytes to file
      const tempFile = await FsPoly.mktemp(
        path.join(Temp.getTempDir(), path.basename(entry.fileNameResolved())),
      );

      try {
        await util.promisify(stream.pipeline)(
          await entry.uncompressedStream(),
          fs.createWriteStream(tempFile),
        );

        const size = await FsPoly.size(tempFile);
        expect(size).toEqual(entry.uncompressedSizeResolved());

        const crc32 = (await FileChecksums.hashFile(tempFile, ChecksumBitmask.CRC32)).crc32;
        expect(crc32).toEqual(entry.uncompressedCrc32String());
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    }
  });
});
