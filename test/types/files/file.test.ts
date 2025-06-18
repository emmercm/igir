import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import IOFile from '../../../src/polyfill/ioFile.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import ArchiveFile from '../../../src/types/files/archives/archiveFile.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import Options from '../../../src/types/options.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

describe('fileOf', () => {
  it("should not throw when the file doesn't exist", async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    const file = await File.fileOf({ filePath: tempFile });
    expect(file.getFilePath()).toEqual(tempFile);
    expect(file.getSize()).toEqual(0);
    expect(file.getSizeWithoutHeader()).toEqual(0);
    expect(file.getExtractedFilePath()).toEqual(path.basename(tempFile));
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getFilePath', () => {
  it('should return the constructor value', async () => {
    const file = await File.fileOf({ filePath: path.join('some', 'path') });
    expect(file.getFilePath()).toEqual(path.join('some', 'path'));
  });
});

describe('getSize', () => {
  describe.each([[0], [1], [100], [10_000], [1_000_000]])('bytes: %s', (size) => {
    it("should get the file's size", async () => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        const tempFile = await FsPoly.mktemp(path.join(tempDir, 'file'));
        await (await IOFile.fileOfSize(tempFile, 'r', size)).close(); // touch

        const fileLink = await File.fileOf({ filePath: tempFile });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    });

    it("should get the hard link's target size", async () => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        const tempFile = await FsPoly.mktemp(path.join(tempDir, 'file'));
        await (await IOFile.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await FsPoly.mktemp(path.join(tempDir, 'link'));
        await FsPoly.hardlink(tempFile, tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    });

    it("should get the absolute symlink's target size", async () => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        const tempFile = await FsPoly.mktemp(path.join(tempDir, 'file'));
        await (await IOFile.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await FsPoly.mktemp(path.join(tempDir, 'link'));
        await FsPoly.symlink(path.resolve(tempFile), tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    });

    it("should get the relative symlink's target size: %s", async () => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        const tempFile = await FsPoly.mktemp(path.join(tempDir, 'file'));
        await (await IOFile.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await FsPoly.mktemp(path.join(tempDir, 'link'));
        await FsPoly.symlink(await FsPoly.symlinkRelativePath(tempFile, tempLink), tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    });
  });
});

describe('getCrc32', () => {
  test.each([
    ['0', '00000000'],
    ['1', '00000001'],
    ['001', '00000001'],
    ['2002', '00002002'],
    ['00000000', '00000000'],
  ])('should return the constructor value: %s', async (crc, expectedCrc) => {
    const file = await File.fileOf({ filePath: path.join('some', 'path'), size: 0, crc32: crc });
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the full file: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.CRC32);
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getCrc32WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '9180a163'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '9adca6cc'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.CRC32);
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '6339abe6'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '8beffd94'],
  ])(
    'should hash the file without the header when header is given and present in file: %s',
    async (filePath, expectedCrc) => {
      const header = ROMHeader.headerFromFilename(filePath);
      if (header === undefined) {
        throw new Error(`couldn't get header for: ${filePath}`);
      }
      const file = await (
        await File.fileOf({ filePath }, ChecksumBitmask.CRC32)
      ).withFileHeader(header);
      expect(file.getCrc32()).not.toEqual(file.getCrc32WithoutHeader());
      expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
      expect(file.getMd5()).toBeUndefined();
      expect(file.getMd5WithoutHeader()).toBeUndefined();
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha1WithoutHeader()).toBeUndefined();
      expect(file.getSha256()).toBeUndefined();
      expect(file.getSha256WithoutHeader()).toBeUndefined();
    },
  );
});

describe('getMd5', () => {
  test.each([
    ['./test/fixtures/roms/raw/empty.rom', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/raw/foobar.lnx', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/raw/loremipsum.rom', 'fffcb698d88fbc9425a636ba7e4712a3'],
  ])('should hash the full file: %s', async (filePath, expectedMd5) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.MD5);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toEqual(expectedMd5);
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getMd5WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'dd0b01b99083da35b096da7818223802'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '472f75cef1da864a0b8839ea887eeebc'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedMd5) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.MD5);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toEqual(expectedMd5);
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'd632fd16189bd32f574b0b12c10ede47'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', 'cf62b6d186954e6f5d9feec3adc8ffbc'],
  ])(
    'should hash the file without the header when header is given and present in file: %s',
    async (filePath, expectedMd5) => {
      const header = ROMHeader.headerFromFilename(filePath);
      if (header === undefined) {
        throw new Error(`couldn't get header for: ${filePath}`);
      }
      const file = await (
        await File.fileOf({ filePath }, ChecksumBitmask.MD5)
      ).withFileHeader(header);
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getCrc32WithoutHeader()).toBeUndefined();
      expect(file.getMd5()).not.toEqual(file.getMd5WithoutHeader());
      expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha1WithoutHeader()).toBeUndefined();
      expect(file.getSha256()).toBeUndefined();
      expect(file.getSha256WithoutHeader()).toBeUndefined();
    },
  );
});

describe('getSha1', () => {
  test.each([
    ['./test/fixtures/roms/raw/empty.rom', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/raw/foobar.lnx', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
  ])('should hash the full file: %s', async (filePath, expectedSha1) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA1);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toEqual(expectedSha1);
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getSha1WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '65c4981c2d5e9b5c6735a8b42f520fb95ee160f6'],
    [
      './test/fixtures/roms/headered/speed_test_v51.smc',
      'df36a2352229317a9f51d97f75b7a443563b78d4',
    ],
  ])('should hash the full file when no header given: %s', async (filePath, expectedSha1) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA1);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toEqual(expectedSha1);
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(file.getSha256()).toBeUndefined();
    expect(file.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'f181104ca6ea30fa166260ab29395ce1fcdaa48e'],
    [
      './test/fixtures/roms/headered/speed_test_v51.smc',
      '2f2f061ee81bafb4c48b83993a56969012162d68',
    ],
  ])(
    'should hash the file without the header when header is given and present in file: %s',
    async (filePath, expectedSha1) => {
      const header = ROMHeader.headerFromFilename(filePath);
      if (header === undefined) {
        throw new Error(`couldn't get header for: ${filePath}`);
      }
      const file = await (
        await File.fileOf({ filePath }, ChecksumBitmask.SHA1)
      ).withFileHeader(header);
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getCrc32WithoutHeader()).toBeUndefined();
      expect(file.getMd5()).toBeUndefined();
      expect(file.getMd5WithoutHeader()).toBeUndefined();
      expect(file.getSha1()).not.toEqual(file.getSha1WithoutHeader());
      expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
      expect(file.getSha256()).toBeUndefined();
      expect(file.getSha256WithoutHeader()).toBeUndefined();
    },
  );
});

describe('getSha256', () => {
  test.each([
    [
      './test/fixtures/roms/raw/empty.rom',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
    [
      './test/fixtures/roms/raw/fizzbuzz.nes',
      '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9',
    ],
    [
      './test/fixtures/roms/raw/foobar.lnx',
      'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f',
    ],
    [
      './test/fixtures/roms/raw/loremipsum.rom',
      '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278',
    ],
  ])('should hash the full file: %s', async (filePath, expectedSha256) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA256);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toEqual(expectedSha256);
    expect(file.getSha256WithoutHeader()).toEqual(expectedSha256);
  });
});

describe('getSha256WithoutHeader', () => {
  test.each([
    [
      './test/fixtures/roms/headered/allpads.nes',
      '9ce022805eb472e4ad9a9a7b101a685a86267c6448cc47176b14ee95d0c4afb9',
    ],
    [
      './test/fixtures/roms/headered/speed_test_v51.smc',
      '48645c5d772dcdcd62f11c91bd01d5903a70a89c348cb8febd7ade27fa57130f',
    ],
  ])('should hash the full file when no header given: %s', async (filePath, expectedSha256) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA256);
    expect(file.getCrc32()).toBeUndefined();
    expect(file.getCrc32WithoutHeader()).toBeUndefined();
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
    expect(file.getSha256()).toEqual(expectedSha256);
    expect(file.getSha256WithoutHeader()).toEqual(expectedSha256);
  });

  test.each([
    [
      './test/fixtures/roms/headered/allpads.nes',
      '0b755904293f112d53ce159a613ef38aca68c84027ee8573a1d54f6317c3d755',
    ],
    [
      './test/fixtures/roms/headered/speed_test_v51.smc',
      '21c24e4b0ec2cb32eeba25c5311aa39bd3228fc1327d2719c0b88671884c2541',
    ],
  ])(
    'should hash the file without the header when header is given and present in file: %s',
    async (filePath, expectedSha256) => {
      const header = ROMHeader.headerFromFilename(filePath);
      if (header === undefined) {
        throw new Error(`couldn't get header for: ${filePath}`);
      }
      const file = await (
        await File.fileOf({ filePath }, ChecksumBitmask.SHA256)
      ).withFileHeader(header);
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getCrc32WithoutHeader()).toBeUndefined();
      expect(file.getMd5()).toBeUndefined();
      expect(file.getMd5WithoutHeader()).toBeUndefined();
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha1WithoutHeader()).toBeUndefined();
      expect(file.getSha256()).not.toEqual(file.getSha256WithoutHeader());
      expect(file.getSha256WithoutHeader()).toEqual(expectedSha256);
    },
  );
});

describe('copyToTempFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/raw'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(raws).toHaveLength(10);

    const temp = await FsPoly.mkdtemp(Temp.getTempDir());
    for (const raw of raws) {
      await raw.extractToTempFile(async (tempFile) => {
        await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
        expect(tempFile).not.toEqual(raw.getFilePath());
      });
    }
    await FsPoly.rm(temp, { recursive: true });
  });
});

describe('createReadStream', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(
      new Options({
        input: ['./test/fixtures/roms/raw/!(empty).*'],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    expect(raws).toHaveLength(9);

    const temp = await FsPoly.mkdtemp(Temp.getTempDir());
    for (const raw of raws) {
      await raw.createReadStream(async (readable) => {
        const contents = (await bufferPoly.fromReadable(readable)).toString();
        expect(contents).toBeTruthy();
      });
    }
    await FsPoly.rm(temp, { recursive: true });
  });
});

describe('withPatch', () => {
  it('should attach a matching patch', async () => {
    const file = await File.fileOf({ filePath: 'file.rom', size: 0, crc32: '00000000' });
    const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
    const patchedFile = file.withPatch(patch);
    expect(patchedFile.getPatch()).toEqual(patch);
  });

  it('should not attach a non-matching patch', async () => {
    const file = await File.fileOf({ filePath: 'file.rom', size: 0, crc32: 'FFFFFFFF' });
    const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
    const patchedFile = file.withPatch(patch);
    expect(patchedFile.getPatch()).toBeUndefined();
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const file = await File.fileOf({ filePath: 'file.rom' });
    expect(file.equals(file)).toEqual(true);
  });

  it('should equal the same file', async () => {
    const first = await File.fileOf({ filePath: 'file.rom' });
    const second = await File.fileOf({ filePath: 'file.rom' });
    expect(first.equals(second)).toEqual(true);
    expect(second.equals(first)).toEqual(true);
  });

  it('should not equal a different file', async () => {
    const first = await File.fileOf({ filePath: 'file.rom' });
    const second = await File.fileOf({ filePath: 'other.rom' });
    const third = await File.fileOf({ filePath: 'file.rom', size: 0, crc32: '12345678' });
    expect(first.equals(second)).toEqual(false);
    expect(second.equals(third)).toEqual(false);
    expect(third.equals(first)).toEqual(false);
  });

  it('should equal an ArchiveFile', async () => {
    const filePath = 'file.zip';
    const file = await File.fileOf({ filePath });

    const entry = await ArchiveEntry.entryOf({
      archive: new Zip(filePath),
      entryPath: 'entry.rom',
    });
    const archiveFile = new ArchiveFile(entry.getArchive(), {});

    expect(file.equals(archiveFile)).toEqual(true);
  });
});
