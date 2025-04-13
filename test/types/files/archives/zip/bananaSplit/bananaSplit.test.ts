import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import Temp from '../../../../../../src/globals/temp.js';
import FsPoly from '../../../../../../src/polyfill/fsPoly.js';
import BananaSplit from '../../../../../../src/types/files/archives/zip/bananaSplit/bananaSplit.js';
import { CompressionMethodValue } from '../../../../../../src/types/files/archives/zip/bananaSplit/fileRecord.js';
import FileChecksums, { ChecksumBitmask } from '../../../../../../src/types/files/fileChecksums.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const fixtures = (await FsPoly.walk(dirname)).filter((filePath) => !filePath.endsWith('.ts'));

describe('entries', () => {
  const emptyFixtures = fixtures.filter((filePath) => path.basename(filePath) === 'empty.zip');
  const nonEmptyFixtures = fixtures.filter((filePath) => !emptyFixtures.includes(filePath));

  test.each(emptyFixtures)('empty: %s', async (filePath) => {
    const entries = await new BananaSplit(filePath).entries();
    expect(entries).toHaveLength(0);
  });

  // TODO(cemmer): add `unzipper` test fixtures
  const expected = new Map<
    string,
    [number, CompressionMethodValue, number, string | number, string, string][]
  >([
    [
      path.join('libziparchive', 'declaredlength.zip'),
      [
        [0, 0, 0, '10-03-2012 11:16', '00000000', 'ani4/'],
        [0, 0, 0, '06-21-2012 11:09', '00000000', 'ani5/'],
        [0, 0, 0, '08-26-2014 10:02', '00000000', 'black/'],
        [0, 0, 0, '03-13-2015 13:31', '00000000', 'black/00001.jpg'],
        [0, 0, 0, '08-26-2014 10:03', '00000000', 'generic1/'],
        [0, 0, 0, '08-26-2014 10:02', '00000000', 'generic2/'],
        [0, 0, 0, '08-26-2014 10:02', '00000000', 'generic3/'],
      ],
    ],
    [
      path.join('libziparchive', 'dummy-update.zip'),
      [
        [0, 0, 0, '06-28-2011 13:06', '00000000', 'META-INF/com/android/metadata'],
        [
          304_100,
          8,
          195_384,
          '09-19-2011 14:06',
          'b6736c81',
          'META-INF/com/google/android/update-binary',
        ],
        [35, 8, 33, '09-19-2011 14:06', '3f85229c', 'META-INF/com/google/android/updater-script'],
        [888_795, 8, 889_070, '09-19-2011 14:06', '5635625f', 'filler.dat'],
        [394, 8, 253, '09-19-2011 14:06', '2c590837', 'META-INF/MANIFEST.MF'],
        [447, 8, 283, '09-19-2011 14:06', '173838ea', 'META-INF/CERT.SF'],
        [1714, 8, 1156, '09-19-2011 14:06', '526a227f', 'META-INF/CERT.RSA'],
        [1675, 8, 944, '09-19-2011 14:06', 'c4c94ebc', 'META-INF/com/android/otacert'],
      ],
    ],
    [path.join('libziparchive', 'empty.zip'), []],
    [
      path.join('libziparchive', 'large.zip'),
      [
        [788_890, 8, 215_330, '11-10-2015 14:49', 'e7c71763', 'compress.txt'],
        [100_000, 0, 100_000, '11-10-2015 14:49', 'f5643627', 'uncompress.txt'],
      ],
    ],
    [
      path.join('libziparchive', 'valid.zip'),
      [
        [17, 8, 13, '12-10-2013 08:00', '950821c5', 'a.txt'],
        [0, 0, 0, '12-10-2013 08:00', '00000000', 'b/'],
        [9, 0, 9, '12-10-2013 08:00', '5912b84d', 'b.txt'],
        [9, 0, 9, '12-10-2013 08:00', '5912b84d', 'b/d.txt'],
        [17, 8, 13, '12-10-2013 08:00', '950821c5', 'b/c.txt'],
      ],
    ],
    [
      path.join('libziparchive', 'zero-size-cd.zip'),
      [[0, 0, 0, '12-16-2019 13:49', '00000000', 'a']],
    ],
    [path.join('libziparchive', 'zip64.zip'), [[4, 0, 4, '03-30-2020 22:31', '5a82fd08', '-']]],
    [
      path.join('yauzl', 'cygwin-info-zip.zip'),
      [
        [5, 0, 5, '08-18-2014 09:30', '8756e051', 'a.txt'],
        [5, 0, 5, '08-18-2014 09:30', 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'deflate.zip'),
      [[10_689, 8, 2827, '08-20-2014 01:08', '12880419', 'index.js']],
    ],
    [
      path.join('yauzl', 'directories.zip'),
      [
        [0, 0, 0, '08-22-2014 21:47', '00000000', 'a/'],
        [0, 0, 0, '08-22-2014 21:47', '00000000', 'a/a.txt'],
        [0, 0, 0, '08-22-2014 23:24', '00000000', 'b/'],
      ],
    ],
    [path.join('yauzl', 'empty.zip'), []],
    [
      path.join('yauzl', 'linux-info-zip.zip'),
      [
        [5, 0, 5, '08-18-2014 09:30', '8756e051', 'a.txt'],
        [5, 0, 5, '08-18-2014 09:30', 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'sloppy-filenames.zip'),
      [
        [5, 0, 5, '08-18-2014 09:30', '8756e051', 'a\\txt'],
        [5, 0, 5, '08-18-2014 09:30', 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'streaming.zip'),
      [
        [25, 8, 8, '03-03-2025 03:29', '4fc8b8b2', 'test1.txt'],
        [25, 8, 8, '03-03-2025 03:29', 'ce20b234', 'test2.txt'],
      ],
    ],
    [
      path.join('yauzl', 'traditional-encryption.zip'),
      [[6, 0, 18, '04-18-2017 17:15', '363a3020', 'a.txt']],
    ],
    [
      path.join('yauzl', 'traditional-encryption-and-compression.zip'),
      [[1000, 8, 23, '04-18-2017 18:37', '060b1780', 'a.bin']],
    ],
    [
      path.join('yauzl', 'unicode.zip'),
      [
        [0, 0, 0, '08-28-2014 01:35', '00000000', 'Turmion Kätilöt/'],
        [0, 0, 0, '08-28-2014 01:34', '00000000', 'Turmion Kätilöt/Hoitovirhe/'],
        [0, 0, 0, '08-28-2014 01:36', '00000000', 'Turmion Kätilöt/Hoitovirhe/Rautaketju.mp3'],
        [0, 0, 0, '08-28-2014 01:37', '00000000', 'Turmion Kätilöt/Pirun nyrkki/'],
        [
          0,
          0,
          0,
          '08-28-2014 01:36',
          '00000000',
          'Turmion Kätilöt/Pirun nyrkki/Mistä veri pakenee.mp3',
        ],
      ],
    ],
    [
      path.join('yauzl', 'unicode-path-extra-field.zip'),
      [[0, 0, 0, '06-14-2016 18:01', '00000000', '七个房间.txt']],
    ],
    [
      path.join('yauzl', 'unix-epoch.zip'),
      [[0, 0, 0, '12-31-1969 16:00', '00000000', 'unix-epoch.txt']],
    ],
    [
      path.join('yauzl', 'windows-7-zip.zip'),
      [
        [5, 0, 5, '08-18-2014 09:30', '8756e051', 'a.txt'],
        [5, 0, 5, '08-18-2014 09:30', 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'windows-compressed-folder.zip'),
      [
        [5, 0, 5, '08-18-2014 09:30', '8756e051', 'a.txt'],
        [5, 0, 5, '08-18-2014 09:30', 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'zip64.zip'),
      [
        [3, 8, 5, '08-11-2016 15:45', '8c736521', 'test1.txt'],
        [3, 8, 5, '08-11-2016 15:45', '76ff8caa', 'test2.txt'],
      ],
    ],
    [
      path.join('unzipper', 'chunk-boundary.zip'),
      [
        [0, 0, 0, '09-22-2018 10:14', '00000000', 'chunk-boundary-archive/'],
        [486, 8, 397, '09-22-2018 10:19', '54a65dca', 'chunk-boundary-archive/chunk-boundary.txt'],
        [6148, 8, 235, '09-22-2018 06:26', '9e541964', 'chunk-boundary-archive/.DS_Store'],
        [0, 0, 0, '09-22-2018 10:19', '00000000', '__MACOSX/'],
        [0, 0, 0, '09-22-2018 10:19', '00000000', '__MACOSX/chunk-boundary-archive/'],
        [120, 8, 53, '09-22-2018 06:26', '38c0880b', '__MACOSX/chunk-boundary-archive/._.DS_Store'],
        [568, 8, 458, '09-22-2018 10:14', 'eb4518be', 'chunk-boundary-archive/chunk-boundary2.txt'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-OSX-Finder.zip'),
      [
        [0, 0, 0, '02-03-2013 10:21', '00000000', 'dir/'],
        [3, 8, 5, '02-03-2013 10:21', 'd1862931', 'dir/fileInsideDir.txt'],
        [2712, 8, 1161, '02-03-2013 10:21', '97a7ed7a', 'file.txt'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-comment.zip'),
      [
        [15, 8, 17, '05-26-2020 21:32', '4d372318', 'file.txt'],
        [0, 0, 0, '05-26-2020 21:32', '00000000', 'dir/'],
        [4, 8, 6, '05-26-2020 21:32', '2c991647', 'dir/fileInsideDir.txt'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-cp866.zip'),
      // TODO(cemmer): need to handle this encoding?
      [[13, 0, 13, '01-03-2019 11:42', 'f77a2052', '����.txt']],
    ],
    [
      path.join('unzipper', 'compressed-directory-entry.zip'),
      [
        [20, 0, 20, '03-27-2018 16:29', '2cab616f', 'mimetype'],
        [0, 8, 2, '03-27-2018 16:29', '00000000', 'META-INF/'],
        [244, 8, 154, '03-27-2018 16:29', '74069f90', 'META-INF/container.xml'],
        [58, 8, 42, '03-27-2018 16:29', '08765cc3', 'page_styles.css'],
        [670, 8, 364, '03-27-2018 16:29', '1c517816', 'toc.ncx'],
        [654, 8, 368, '03-27-2018 16:29', '9fa5bb03', 'index.html'],
        [174, 8, 101, '03-27-2018 16:29', '3c58138e', 'stylesheet.css'],
        [1264, 8, 607, '03-27-2018 16:29', 'e76dd43d', 'content.opf'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-encrypted.zip'),
      [
        [0, 0, 0, '01-22-2017 16:00', '00000000', 'dir/'],
        [3, 0, 15, '01-22-2017 16:00', 'd1862931', 'dir/fileInsideDir.txt'],
        // TODO(cemmer): compressed size is wrong? should be 1161
        [2712, 8, 1173, '01-22-2017 16:00', '97a7ed7a', 'file.txt'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-flags-set.zip'),
      [
        [0, 0, 0, '08-08-2012 08:18', '00000000', 'dir/'],
        [3, 0, 3, '08-08-2012 08:18', 'd1862931', 'dir/fileInsideDir.txt'],
        [2712, 8, 1161, '08-08-2012 08:21', '97a7ed7a', 'file.txt'],
      ],
    ],
    [
      path.join('unzipper', 'compressed-standard-archive.zip'),
      [
        [0, 0, 0, '08-08-2012 08:18', '00000000', 'dir/'],
        [3, 0, 3, '08-08-2012 08:18', 'd1862931', 'dir/fileInsideDir.txt'],
        [2712, 8, 1161, '08-08-2012 08:21', '97a7ed7a', 'file.txt'],
        [0, 0, 0, '06-08-2024 08:48', '00000000', 'emptydir/'],
        [0, 0, 0, '06-08-2024 08:48', '00000000', 'emptyroot/'],
        [0, 0, 0, '06-08-2024 08:48', '00000000', 'emptyroot/emptydir/'],
      ],
    ],
    [
      path.join('unzipper', 'uncompressed.zip'),
      [
        [0, 0, 0, '08-08-2012 08:18', '00000000', 'dir/'],
        [3, 0, 3, '08-08-2012 08:18', 'd1862931', 'dir/fileInsideDir.txt'],
        [14, 0, 14, '08-08-2012 08:18', '144ca5ef', 'file.txt'],
      ],
    ],
    [
      path.join('unzipper', 'zip-slip-win.zip'),
      [
        [19, 0, 19, '04-15-2018 12:04', 'f34f6f0f', 'good.txt'],
        [
          20,
          0,
          20,
          '04-15-2018 22:04',
          '397b4160',
          '..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\Temp\\evil.txt',
        ],
      ],
    ],
    [
      path.join('unzipper', 'zip-slip.zip'),
      [
        [19, 0, 19, '04-15-2018 12:04', 'f34f6f0f', 'good.txt'],
        [
          20,
          0,
          20,
          '04-15-2018 22:04',
          '397b4160',
          '../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../tmp/evil.txt',
        ],
      ],
    ],
    [
      path.join('unzipper', 'zip64-allextrafields.zip'),
      [[36, 8, 36, '08-10-2012 14:33', '69ffe77e', 'README']],
    ],
    [
      path.join('unzipper', 'zip64-extrafieldoffsetlength.zip'),
      [[36, 8, 36, '08-10-2012 14:33', '69ffe77e', 'README']],
    ],
    [path.join('unzipper', 'zip64.zip'), [[36, 8, 36, '08-10-2012 14:33', '69ffe77e', 'README']]],
  ]);

  test.each(nonEmptyFixtures)('non-empty: %s', async (filePath) => {
    const entries = await new BananaSplit(filePath).entries();
    expect(entries.length).toBeGreaterThan(0);

    expect(
      entries.map((entry) => [
        // `unzip -v` output
        entry.uncompressedSize,
        entry.compressionMethod,
        entry.compressedSize,
        entry.timestamps.modified === undefined
          ? undefined
          : `${(entry.timestamps.modified.getUTCMonth() + 1).toString().padStart(2, '0')}-${entry.timestamps.modified.getUTCDate().toString().padStart(2, '0')}-${entry.timestamps.modified.getUTCFullYear().toString().padStart(4, '0')} ${entry.timestamps.modified.getUTCHours().toString().padStart(2, '0')}:${entry.timestamps.modified.getUTCMinutes().toString().padStart(2, '0')}`,
        entry.uncompressedCrc32,
        entry.fileName.toString('utf8'),
      ]),
    ).toEqual(expected.get(filePath.replace(dirname, '')));

    /* eslint-disable jest/no-conditional-expect */
    for (const entry of entries) {
      expect(entry.uncompressedCrc32).toHaveLength(8);

      // Directory
      if (entry.fileName.toString('utf8').endsWith('/')) {
        expect(entry.uncompressedCrc32).toEqual('00000000');
        expect(entry.uncompressedSize).toEqual(0);
      }

      // Empty file
      if (entry.compressedSize === 0) {
        expect(entry.uncompressedSize).toEqual(0);
        expect(entry.uncompressedCrc32).toEqual('00000000');
      }

      expect(entry.fileName).not.toEqual('');
    }
  });
});

describe('compressedStream', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const zip = new BananaSplit(filePath);
    const entries = await zip.entries();

    if (!(await FsPoly.exists(Temp.getTempDir()))) {
      await FsPoly.mkdir(Temp.getTempDir());
    }

    for (const entry of entries.filter(
      (entry) => !entry.isDirectory() && !entry.isEncrypted() && entry.compressedSize < 10_485_760, // 10MiB
    )) {
      // Write compressed bytes to file
      const tempFile = await FsPoly.mktemp(
        path.join(Temp.getTempDir(), path.basename(entry.fileName.toString('utf8'))),
      );
      const compressedStream = await zip.compressedStream(entry);
      await new Promise<void>((resolve, reject) => {
        compressedStream
          .pipe(fs.createWriteStream(tempFile))
          .on('finish', resolve)
          .on('error', reject);
      });

      try {
        await expect(FsPoly.size(tempFile)).resolves.toEqual(entry.compressedSize);
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    }
  });
});

describe('uncompressedStream', () => {
  test.each(fixtures)('%s', async (filePath) => {
    const zip = new BananaSplit(filePath);
    const entries = await zip.entries();

    if (!(await FsPoly.exists(Temp.getTempDir()))) {
      await FsPoly.mkdir(Temp.getTempDir());
    }

    for (const entry of entries.filter(
      (entry) => !entry.isDirectory() && !entry.isEncrypted() && entry.compressedSize < 10_485_760, // 10MiB
    )) {
      // Write compressed bytes to file
      const tempFile = await FsPoly.mktemp(
        path.join(Temp.getTempDir(), path.basename(entry.fileName.toString('utf8'))),
      );
      const uncompressedStream = await zip.uncompressedStream(entry);
      await new Promise<void>((resolve, reject) => {
        uncompressedStream
          .on('error', reject)
          .pipe(fs.createWriteStream(tempFile))
          .on('finish', resolve)
          .on('error', reject);
      });

      try {
        const size = await FsPoly.size(tempFile);
        expect(size).toEqual(entry.uncompressedSize);

        const crc32 = (await FileChecksums.hashFile(tempFile, ChecksumBitmask.CRC32)).crc32;
        expect(crc32).toEqual(entry.uncompressedCrc32);
      } finally {
        await FsPoly.rm(tempFile, { force: true });
      }
    }
  });
});
