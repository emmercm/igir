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
    [number, CompressionMethodValue, number, number, string, string][]
  >([
    [
      path.join('libziparchive', 'declaredlength.zip'),
      [
        [0, 0, 0, 1_349_288_190, '00000000', 'ani4/'],
        [0, 0, 0, 1_340_302_192, '00000000', 'ani5/'],
        [0, 0, 0, 1_409_072_570, '00000000', 'black/'],
        [0, 0, 0, 1_426_278_718, '00000000', 'black/00001.jpg'],
        [0, 0, 0, 1_409_072_614, '00000000', 'generic1/'],
        [0, 0, 0, 1_409_072_570, '00000000', 'generic2/'],
        [0, 0, 0, 1_409_072_570, '00000000', 'generic3/'],
      ],
    ],
    [
      path.join('libziparchive', 'dummy-update.zip'),
      [
        [0, 0, 0, 1_309_291_613, '00000000', 'META-INF/com/android/metadata'],
        [
          304_100,
          8,
          195_384,
          1_316_466_402,
          'b6736c81',
          'META-INF/com/google/android/update-binary',
        ],
        [35, 8, 33, 1_316_466_402, '3f85229c', 'META-INF/com/google/android/updater-script'],
        [888_795, 8, 889_070, 1_316_466_402, '5635625f', 'filler.dat'],
        [394, 8, 253, 1_316_466_402, '2c590837', 'META-INF/MANIFEST.MF'],
        [447, 8, 283, 1_316_466_402, '173838ea', 'META-INF/CERT.SF'],
        [1714, 8, 1156, 1_316_466_402, '526a227f', 'META-INF/CERT.RSA'],
        [1675, 8, 944, 1_316_466_402, 'c4c94ebc', 'META-INF/com/android/otacert'],
      ],
    ],
    [path.join('libziparchive', 'empty.zip'), []],
    [
      path.join('libziparchive', 'large.zip'),
      [
        [788_890, 8, 215_330, 1_447_195_757, 'e7c71763', 'compress.txt'],
        [100_000, 0, 100_000, 1_447_195_757, 'f5643627', 'uncompress.txt'],
      ],
    ],
    [
      path.join('libziparchive', 'valid.zip'),
      [
        [17, 8, 13, 1_386_691_209, '950821c5', 'a.txt'],
        [0, 0, 0, 1_386_691_234, '00000000', 'b/'],
        [9, 0, 9, 1_386_691_217, '5912b84d', 'b.txt'],
        [9, 0, 9, 1_386_691_234, '5912b84d', 'b/d.txt'],
        [17, 8, 13, 1_386_691_228, '950821c5', 'b/c.txt'],
      ],
    ],
    [path.join('libziparchive', 'zero-size-cd.zip'), [[0, 0, 0, 1_576_532_970, '00000000', 'a']]],
    [path.join('libziparchive', 'zip64.zip'), [[4, 0, 4, 1_585_632_680, '5a82fd08', '-']]],
    [
      path.join('yauzl', 'cygwin-info-zip.zip'),
      [
        [5, 0, 5, 1_408_379_453, '8756e051', 'a.txt'],
        [5, 0, 5, 1_408_379_453, 'c0f69a81', 'b.txt'],
      ],
    ],
    [path.join('yauzl', 'deflate.zip'), [[10_689, 8, 2827, 1_408_522_133, '12880419', 'index.js']]],
    [
      path.join('yauzl', 'directories.zip'),
      [
        [0, 0, 0, 1_408_769_228, '00000000', 'a/'],
        [0, 0, 0, 1_408_769_228, '00000000', 'a/a.txt'],
        [0, 0, 0, 1_408_775_087, '00000000', 'b/'],
      ],
    ],
    [path.join('yauzl', 'empty.zip'), []],
    [
      path.join('yauzl', 'linux-info-zip.zip'),
      [
        [5, 0, 5, 1_408_379_454, '8756e051', 'a.txt'],
        [5, 0, 5, 1_408_379_454, 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'sloppy-filenames.zip'),
      [
        [5, 0, 5, 1_408_379_454, '8756e051', 'a\\txt'],
        [5, 0, 5, 1_408_379_454, 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'streaming.zip'),
      [
        [25, 8, 8, 1_741_001_383, '4fc8b8b2', 'test1.txt'],
        [25, 8, 8, 1_741_001_390, 'ce20b234', 'test2.txt'],
      ],
    ],
    [
      path.join('yauzl', 'traditional-encryption.zip'),
      [[6, 0, 18, 1_492_560_954, '363a3020', 'a.txt']],
    ],
    [
      path.join('yauzl', 'traditional-encryption-and-compression.zip'),
      [[1000, 8, 23, 1_492_565_865, '060b1780', 'a.bin']],
    ],
    [
      path.join('yauzl', 'unicode.zip'),
      [
        [0, 0, 0, 1_409_214_952, '00000000', 'Turmion Kätilöt/'],
        [0, 0, 0, 1_409_214_849, '00000000', 'Turmion Kätilöt/Hoitovirhe/'],
        [0, 0, 0, 1_409_214_992, '00000000', 'Turmion Kätilöt/Hoitovirhe/Rautaketju.mp3'],
        [0, 0, 0, 1_409_215_024, '00000000', 'Turmion Kätilöt/Pirun nyrkki/'],
        [0, 0, 0, 1_409_215_001, '00000000', 'Turmion Kätilöt/Pirun nyrkki/Mistä veri pakenee.mp3'],
      ],
    ],
    [
      path.join('yauzl', 'unicode-path-extra-field.zip'),
      [[0, 0, 0, 1_465_952_470, '00000000', '七个房间.txt']],
    ],
    [path.join('yauzl', 'unix-epoch.zip'), [[0, 0, 0, 0, '00000000', 'unix-epoch.txt']]],
    [
      path.join('yauzl', 'windows-7-zip.zip'),
      [
        [5, 0, 5, 1_408_379_454, '8756e051', 'a.txt'],
        [5, 0, 5, 1_408_379_454, 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'windows-compressed-folder.zip'),
      [
        [5, 0, 5, 1_408_379_454, '8756e051', 'a.txt'],
        [5, 0, 5, 1_408_379_454, 'c0f69a81', 'b.txt'],
      ],
    ],
    [
      path.join('yauzl', 'zip64.zip'),
      [
        [3, 8, 5, 1_470_955_514, '8c736521', 'test1.txt'],
        [3, 8, 5, 1_470_955_530, '76ff8caa', 'test2.txt'],
      ],
    ],
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
        entry.timestamps.modified,
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
        expect(entry.compressedSize).toEqual(0);
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
