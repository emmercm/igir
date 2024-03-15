import path from 'node:path';

import Constants from '../../../src/constants.js';
import ROMScanner from '../../../src/modules/romScanner.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FilePoly from '../../../src/polyfill/filePoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import Options from '../../../src/types/options.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('fileOf', () => {
  it('should not throw when the file doesn\'t exist', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    const file = await File.fileOf({ filePath: tempFile });
    expect(file.getFilePath()).toEqual(tempFile);
    expect(file.getSize()).toEqual(0);
    expect(file.getSizeWithoutHeader()).toEqual(0);
    expect(file.getExtractedFilePath()).toEqual(path.basename(tempFile));
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });
});

describe('getFilePath', () => {
  it('should return the constructor value', async () => {
    const file = await File.fileOf({ filePath: path.join('some', 'path') });
    expect(file.getFilePath()).toEqual(path.join('some', 'path'));
  });
});

describe('getSize', () => {
  describe.each([
    [0],
    [1],
    [100],
    [10_000],
    [1_000_000],
  ])('%s', (size) => {
    it('should get the file\'s size: %s', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'file')));
        await (await FilePoly.fileOfSize(tempFile, 'r', size)).close(); // touch

        const fileLink = await File.fileOf({ filePath: tempFile });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });

    it('should get the hard link\'s target size: %s', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'file')));
        await (await FilePoly.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await fsPoly.mktemp(path.join(tempDir, 'link'));
        await fsPoly.hardlink(path.resolve(tempFile), tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });

    it('should get the absolute symlink\'s target size: %s', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'file')));
        await (await FilePoly.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await fsPoly.mktemp(path.join(tempDir, 'link'));
        await fsPoly.symlink(path.resolve(tempFile), tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });

    it('should get the relative symlink\'s target size: %s', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'file')));
        await (await FilePoly.fileOfSize(tempFile, 'r', size)).close(); // touch

        const tempLink = await fsPoly.mktemp(path.join(tempDir, 'link'));
        await fsPoly.symlink(await fsPoly.symlinkRelativePath(tempFile, tempLink), tempLink);
        const fileLink = await File.fileOf({ filePath: tempLink });

        expect(fileLink.getSize()).toEqual(size);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
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
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the full file: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf({ filePath });
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });
});

describe('getCrc32WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '9180a163'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '9adca6cc'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf({ filePath });
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
  ])('should hash the full file when header is given but not present in file: %s', async (filePath, expectedCrc) => {
    const file = await (await File.fileOf({ filePath }))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).toEqual(expectedCrc);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '6339abe6'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '8beffd94'],
  ])('should hash the file without the header when header is given and present in file: %s', async (filePath, expectedCrc) => {
    const file = await (await File.fileOf({ filePath }))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).not.toEqual(file.getCrc32WithoutHeader());
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });
});

describe('getMd5', () => {
  test.each([
    ['./test/fixtures/roms/raw/empty.rom', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/raw/foobar.lnx', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/raw/loremipsum.rom', 'fffcb698d88fbc9425a636ba7e4712a3'],
  ])('should hash the full file: %s', async (filePath, expectedMd5) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.MD5);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toEqual(expectedMd5);
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });
});

describe('getMd5WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'dd0b01b99083da35b096da7818223802'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '472f75cef1da864a0b8839ea887eeebc'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedMd5) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.MD5);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toEqual(expectedMd5);
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/raw/fizzbuzz.nes', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/raw/foobar.lnx', '14758f1afd44c09b7992073ccf00b43d'],
  ])('should hash the full file when header is given but not present in file: %s', async (filePath, expectedMd5) => {
    const file = await (await File.fileOf({ filePath }, ChecksumBitmask.MD5))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toEqual(expectedMd5);
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'd632fd16189bd32f574b0b12c10ede47'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', 'cf62b6d186954e6f5d9feec3adc8ffbc'],
  ])('should hash the file without the header when header is given and present in file: %s', async (filePath, expectedMd5) => {
    const file = await (await File.fileOf({ filePath }, ChecksumBitmask.MD5))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).not.toEqual(file.getMd5WithoutHeader());
    expect(file.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(file.getSha1()).toBeUndefined();
    expect(file.getSha1WithoutHeader()).toBeUndefined();
  });
});

describe('getSha1', () => {
  test.each([
    ['./test/fixtures/roms/raw/empty.rom', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/raw/foobar.lnx', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
  ])('should hash the full file: %s', async (filePath, expectedSha1) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA1);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toEqual(expectedSha1);
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
  });
});

describe('getSha1WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '65c4981c2d5e9b5c6735a8b42f520fb95ee160f6'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', 'df36a2352229317a9f51d97f75b7a443563b78d4'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedSha1) => {
    const file = await File.fileOf({ filePath }, ChecksumBitmask.SHA1);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toEqual(expectedSha1);
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
  });

  test.each([
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/raw/foobar.lnx', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
  ])('should hash the full file when header is given but not present in file: %s', async (filePath, expectedSha1) => {
    const file = await (await File.fileOf({ filePath }, ChecksumBitmask.SHA1))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).toEqual(expectedSha1);
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', 'f181104ca6ea30fa166260ab29395ce1fcdaa48e'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '2f2f061ee81bafb4c48b83993a56969012162d68'],
  ])('should hash the file without the header when header is given and present in file: %s', async (filePath, expectedSha1) => {
    const file = await (await File.fileOf({ filePath }, ChecksumBitmask.SHA1))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32()).toEqual('00000000');
    expect(file.getCrc32WithoutHeader()).toEqual('00000000');
    expect(file.getMd5()).toBeUndefined();
    expect(file.getMd5WithoutHeader()).toBeUndefined();
    expect(file.getSha1()).not.toEqual(file.getSha1WithoutHeader());
    expect(file.getSha1WithoutHeader()).toEqual(expectedSha1);
  });
});

describe('copyToTempFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(10);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (const raw of raws) {
      await raw.extractToTempFile(async (tempFile) => {
        await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
        expect(tempFile).not.toEqual(raw.getFilePath());
      });
    }
    await fsPoly.rm(temp, { recursive: true });
  });
});

describe('createReadStream', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw/!(empty).*'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(9);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (const raw of raws) {
      await raw.createReadStream(async (stream) => {
        const contents = (await bufferPoly.fromReadable(stream)).toString();
        expect(contents).toBeTruthy();
      });
    }
    await fsPoly.rm(temp, { recursive: true });
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
});
