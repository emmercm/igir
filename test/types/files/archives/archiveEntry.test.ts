import path from 'node:path';

import Constants from '../../../../src/constants.js';
import ROMScanner from '../../../../src/modules/romScanner.js';
import ArrayPoly from '../../../../src/polyfill/arrayPoly.js';
import bufferPoly from '../../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../../src/polyfill/fsPoly.js';
import Archive from '../../../../src/types/files/archives/archive.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import SevenZip from '../../../../src/types/files/archives/sevenZip.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import File from '../../../../src/types/files/file.js';
import { ChecksumBitmask } from '../../../../src/types/files/fileChecksums.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import ROMHeader from '../../../../src/types/files/romHeader.js';
import Options from '../../../../src/types/options.js';
import IPSPatch from '../../../../src/types/patches/ipsPatch.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

describe('getEntryPath', () => {
  test.each([
    'something.rom',
    path.join('foo', 'bar.rom'),
  ])('should return the constructor value: %s', async (archiveEntryPath) => {
    const archive = new Zip('/some/archive.zip');
    const archiveEntry = await ArchiveEntry.entryOf({ archive, entryPath: archiveEntryPath });
    expect(archiveEntry.getEntryPath()).toEqual(archiveEntryPath);
  });
});

describe('getSize', () => {
  describe.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 9],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 9],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 9],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 9],
    ['./test/fixtures/roms/7z/foobar.7z', 7],
    ['./test/fixtures/roms/rar/foobar.rar', 7],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 7],
    ['./test/fixtures/roms/zip/foobar.zip', 7],
    ['./test/fixtures/roms/7z/loremipsum.7z', 11],
    ['./test/fixtures/roms/rar/loremipsum.rar', 11],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', 11],
    ['./test/fixtures/roms/zip/loremipsum.zip', 11],
  ])('%s', (filePath, expectedSize) => {
    it('should get the file\'s size', async () => {
      const archiveEntries = await FileFactory.filesFrom(filePath);
      expect(archiveEntries).toHaveLength(1);
      const archiveEntry = archiveEntries[0];

      expect(archiveEntry.getSize()).toEqual(expectedSize);
    });

    it('should get the hard link\'s target size', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        // Make a copy of the original file to ensure it's on the same drive
        const tempFile = path.join(tempDir, `file_${path.basename(filePath)}`);
        await fsPoly.copyFile(filePath, tempFile);

        const tempLink = path.join(tempDir, `link_${path.basename(filePath)}`);
        await fsPoly.hardlink(path.resolve(tempFile), tempLink);

        const archiveEntries = await FileFactory.filesFrom(tempLink);
        expect(archiveEntries).toHaveLength(1);
        const archiveEntry = archiveEntries[0];

        expect(archiveEntry.getSize()).toEqual(expectedSize);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });

    it('should get the absolute symlink\'s target size', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempLink = path.join(tempDir, path.basename(filePath));
        await fsPoly.symlink(path.resolve(filePath), tempLink);

        const archiveEntries = await FileFactory.filesFrom(tempLink);
        expect(archiveEntries).toHaveLength(1);
        const archiveEntry = archiveEntries[0];

        expect(archiveEntry.getSize()).toEqual(expectedSize);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });

    it('should get the relative symlink\'s target size', async () => {
      const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
      try {
        const tempLink = path.join(tempDir, path.basename(filePath));
        await fsPoly.symlink(await fsPoly.symlinkRelativePath(filePath, tempLink), tempLink);

        const archiveEntries = await FileFactory.filesFrom(tempLink);
        expect(archiveEntries).toHaveLength(1);
        const archiveEntry = archiveEntries[0];

        expect(archiveEntry.getSize()).toEqual(expectedSize);
      } finally {
        await fsPoly.rm(tempDir, { recursive: true });
      }
    });
  });
});

describe('getCrc32', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '370517b5'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '370517b5'],
    ['./test/fixtures/roms/7z/foobar.7z', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'b22c9747'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'b22c9747'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '70856527'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '70856527'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'f6cc9b1c'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '1e58456d'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '2d251538'],
  ])('should hash the full archive entry: %s', async (filePath, expectedCrc) => {
    const archiveEntries = await FileFactory.filesFrom(filePath);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getCrc32WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '370517b5'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '370517b5'],
    ['./test/fixtures/roms/7z/foobar.7z', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'b22c9747'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'b22c9747'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '70856527'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '70856527'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'f6cc9b1c'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '1e58456d'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '2d251538'],
  ])('should hash the full archive entry when no header given: %s', async (filePath, expectedCrc) => {
    const archiveEntries = await FileFactory.filesFrom(filePath);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '370517b5'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '370517b5'],
    ['./test/fixtures/roms/7z/foobar.7z', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'b22c9747'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'b22c9747'],
  ])('should hash the full archive entry when header is given but not present in file: %s', async (filePath, expectedCrc) => {
    const archiveEntries = await FileFactory.filesFrom(filePath);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'a1eaa7c1'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '3ecbac61'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '42583855'],
  ])('should hash the archive entry without the header when header is given and present in file: %s', async (filePath, expectedCrc) => {
    const archiveEntries = await FileFactory.filesFrom(filePath);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    expect(archiveEntry.getCrc32()).not.toEqual(expectedCrc);
    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getMd5', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/7z/foobar.7z', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/rar/foobar.rar', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/zip/foobar.zip', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/7z/loremipsum.7z', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '8df5c10517da1c001072fd5526e4a683'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '74362ca7d47e67e2d3e62f6283ecf879'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '1ea102719a2fc3b767df0d2d367a8371'],
  ])('should hash the full archive entry: %s', async (filePath, expectedMd5) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.MD5);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toEqual(expectedMd5);
    expect(archiveEntry.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getMd5WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/7z/foobar.7z', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/rar/foobar.rar', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/zip/foobar.zip', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/7z/loremipsum.7z', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'fffcb698d88fbc9425a636ba7e4712a3'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '8df5c10517da1c001072fd5526e4a683'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '74362ca7d47e67e2d3e62f6283ecf879'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '1ea102719a2fc3b767df0d2d367a8371'],
  ])('should hash the full archive entry when no header given: %s', async (filePath, expectedMd5) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.MD5);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toEqual(expectedMd5);
    expect(archiveEntry.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'cbe8410861130a91609295349918c2c2'],
    ['./test/fixtures/roms/7z/foobar.7z', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/rar/foobar.rar', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '14758f1afd44c09b7992073ccf00b43d'],
    ['./test/fixtures/roms/zip/foobar.zip', '14758f1afd44c09b7992073ccf00b43d'],
  ])('should hash the full archive entry when header is given but not present in file: %s', async (filePath, expectedMd5) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.MD5);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toEqual(expectedMd5);
    expect(archiveEntry.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '91041aadd1700a7a4076f4005f2c362f'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '26df56a7e5b096577338bcc4c334ec7d'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '294a07b07ce67a9b492e4b6e77d6d2f7'],
  ])('should hash the archive entry without the header when header is given and present in file: %s', async (filePath, expectedMd5) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.MD5);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    expect(archiveEntry.getCrc32()).toBeDefined();
    expect(archiveEntry.getCrc32WithoutHeader()).toBeDefined();
    expect(archiveEntry.getMd5()).not.toEqual(expectedMd5);
    expect(archiveEntry.getMd5WithoutHeader()).toEqual(expectedMd5);
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getSha1', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/7z/foobar.7z', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/rar/foobar.rar', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/zip/foobar.zip', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'f1da35db85f99db8803ae088499cb9dc148fe0c6'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', 'f7b31cc2b6ef841cc51df1711462c07b0994db98'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '3882fcc1c94579a47a213224c572c006d62867f0'],
  ])('should hash the full archive entry: %s', async (filePath, expectedSha1) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA1);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toEqual(expectedSha1);
    expect(archiveEntry.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getSha1WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/7z/foobar.7z', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/rar/foobar.rar', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/zip/foobar.zip', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '1d913738eb363a4056c19e158aa81189a1eb7a55'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', 'f1da35db85f99db8803ae088499cb9dc148fe0c6'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', 'f7b31cc2b6ef841cc51df1711462c07b0994db98'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '3882fcc1c94579a47a213224c572c006d62867f0'],
  ])('should hash the full archive entry when no header given: %s', async (filePath, expectedSha1) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA1);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toEqual(expectedSha1);
    expect(archiveEntry.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '5a316d9f0e06964d94cdd62a933803d7147ddadb'],
    ['./test/fixtures/roms/7z/foobar.7z', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/rar/foobar.rar', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
    ['./test/fixtures/roms/zip/foobar.zip', '988881adc9fc3655077dc2d4d757d480b5ea0e11'],
  ])('should hash the full archive entry when header is given but not present in file: %s', async (filePath, expectedSha1) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA1);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toEqual(expectedSha1);
    expect(archiveEntry.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });

  test.each([
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '76ec76c423d88bdf739e673c051c5b9c174881c6'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '7b6bd1a69bbc5d8121c72dd1eedfb6752fe11787'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', 'e2901046126153b318a09cc1476eec8afff0b698'],
  ])('should hash the archive entry without the header when header is given and present in file: %s', async (filePath, expectedSha1) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA1);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    expect(archiveEntry.getCrc32()).toBeDefined();
    expect(archiveEntry.getCrc32WithoutHeader()).toBeDefined();
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).not.toEqual(expectedSha1);
    expect(archiveEntry.getSha1WithoutHeader()).toEqual(expectedSha1);
    expect(archiveEntry.getSha256()).toBeUndefined();
    expect(archiveEntry.getSha256WithoutHeader()).toBeUndefined();
  });
});

describe('getSha256', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/7z/foobar.7z', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/rar/foobar.rar', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/zip/foobar.zip', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '38c6f2411d1f968a96fb85aa5202283dd53ac1bdfe27b233af00b7e0303afabf'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', 'be4bec168f7d9397454f3a0df761ed9359e82a1f98896756b6596023611fa6c1'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', 'c83ea05dc94aa8e158ecdbf84af91d971574712d73e0ea82f25dee7eaf88a9d4'],
  ])('should hash the full archive entry: %s', async (filePath, expectedSha256) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA256);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toEqual(expectedSha256);
    expect(archiveEntry.getSha256WithoutHeader()).toEqual(expectedSha256);
  });
});

describe('getSha256WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/7z/foobar.7z', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/rar/foobar.rar', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/zip/foobar.zip', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/7z/loremipsum.7z', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/rar/loremipsum.rar', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/tar/loremipsum.tar.gz', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/zip/loremipsum.zip', '9d0dc61fa60a12a9613cc32fa43fc85bea343ec3a25f27d10ed81a7f0b9ec278'],
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '38c6f2411d1f968a96fb85aa5202283dd53ac1bdfe27b233af00b7e0303afabf'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', 'be4bec168f7d9397454f3a0df761ed9359e82a1f98896756b6596023611fa6c1'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', 'c83ea05dc94aa8e158ecdbf84af91d971574712d73e0ea82f25dee7eaf88a9d4'],
  ])('should hash the full archive entry when no header given: %s', async (filePath, expectedSha256) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA256);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = archiveEntries[0];

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toEqual(expectedSha256);
    expect(archiveEntry.getSha256WithoutHeader()).toEqual(expectedSha256);
  });

  test.each([
    ['./test/fixtures/roms/7z/fizzbuzz.7z', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/tar/fizzbuzz.tar.gz', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', '6e809804766eaa4dd42a2607b789f3e4e5d32fc321ba8dd3ef39ddc1ea2888e9'],
    ['./test/fixtures/roms/7z/foobar.7z', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/rar/foobar.rar', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/tar/foobar.tar.gz', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
    ['./test/fixtures/roms/zip/foobar.zip', 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f'],
  ])('should hash the full archive entry when header is given but not present in file: %s', async (filePath, expectedSha256) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA256);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    // Some archives store CRC32, or otherwise it won't be defined
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).toEqual(expectedSha256);
    expect(archiveEntry.getSha256WithoutHeader()).toEqual(expectedSha256);
  });

  test.each([
    ['./test/fixtures/roms/headered/diagnostic_test_cartridge.a78.7z', '248faac52d828b3542b74ff478e87afc6748949ad0f294fe75e6be94966a7558'],
    ['./test/fixtures/roms/headered/fds_joypad_test.fds.zip', '29e56794d15ccaa79e48ec0c80004f8745cfb116cce43b99435ae8790e79c327'],
    ['./test/fixtures/roms/headered/LCDTestROM.lnx.rar', '65da30d4d2b210d9ab0b634deb3f6f8ee38af9a338b2f9bedd4379bacfb2b07d'],
  ])('should hash the archive entry without the header when header is given and present in file: %s', async (filePath, expectedSha256) => {
    const archiveEntries = await FileFactory.filesFrom(filePath, ChecksumBitmask.SHA256);
    expect(archiveEntries).toHaveLength(1);
    const archiveEntry = await archiveEntries[0].withFileHeader(
      ROMHeader.headerFromFilename(archiveEntries[0].getExtractedFilePath()) as ROMHeader,
    );

    expect(archiveEntry.getCrc32()).toBeDefined();
    expect(archiveEntry.getCrc32WithoutHeader()).toBeDefined();
    expect(archiveEntry.getMd5()).toBeUndefined();
    expect(archiveEntry.getMd5WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha1()).toBeUndefined();
    expect(archiveEntry.getSha1WithoutHeader()).toBeUndefined();
    expect(archiveEntry.getSha256()).not.toEqual(expectedSha256);
    expect(archiveEntry.getSha256WithoutHeader()).toEqual(expectedSha256);
  });
});

describe('extractEntryToFile', () => {
  it('should throw on invalid entry paths', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(new Options({
      input: [
        './test/fixtures/roms/7z',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/tar',
        './test/fixtures/roms/zip',
      ],
    }), new ProgressBarFake()).scan();
    const archives = archiveEntries
      .filter((entry): entry is ArchiveEntry<Archive> => entry instanceof ArchiveEntry)
      .map((entry) => entry.getArchive())
      .reduce(ArrayPoly.reduceUnique(), []);
    expect(archives).toHaveLength(21);

    for (const archive of archives) {
      await expect(archive.extractEntryToFile('INVALID FILE', 'INVALID PATH')).rejects.toThrow();
    }
  });
});

describe('copyToTempFile', () => {
  it('should extract archived files', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(new Options({
      input: [
        './test/fixtures/roms/7z',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/tar',
        './test/fixtures/roms/zip',
      ],
    }), new ProgressBarFake()).scan();
    expect(archiveEntries).toHaveLength(30);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (const archiveEntry of archiveEntries) {
      await archiveEntry.extractToTempFile(async (tempFile) => {
        await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
        expect(tempFile).not.toEqual(archiveEntry.getFilePath());
      });
    }
    await fsPoly.rm(temp, { recursive: true });
  });
});

describe('createReadStream', () => {
  it('should extract archived files', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(new Options({
      input: [
        './test/fixtures/roms/7z',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/tar',
        './test/fixtures/roms/zip',
      ],
    }), new ProgressBarFake()).scan();
    expect(archiveEntries).toHaveLength(30);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (const archiveEntry of archiveEntries) {
      await archiveEntry.createReadStream(async (stream) => {
        const contents = (await bufferPoly.fromReadable(stream)).toString();
        expect(contents).toBeTruthy();
      });
    }
    await fsPoly.rm(temp, { recursive: true });
  });
});

describe('withPatch', () => {
  it('should attach a matching patch', async () => {
    const entry = await ArchiveEntry.entryOf({
      archive: new Zip('file.zip'),
      entryPath: 'entry.rom',
      size: 0,
      crc32: '00000000',
    });
    const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
    const patchedEntry = entry.withPatch(patch);
    expect(patchedEntry.getPatch()).toEqual(patch);
  });

  it('should not attach a non-matching patch', async () => {
    const entry = await ArchiveEntry.entryOf({
      archive: new Zip('file.zip'),
      entryPath: 'entry.rom',
      size: 0,
      crc32: 'FFFFFFFF',
    });
    const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
    const patchedEntry = entry.withPatch(patch);
    expect(patchedEntry.getPatch()).toBeUndefined();
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const entry = await ArchiveEntry.entryOf({ archive: new Zip('file.zip'), entryPath: 'entry.rom' });
    expect(entry.equals(entry)).toEqual(true);
  });

  it('should equal the same entry', async () => {
    const first = await ArchiveEntry.entryOf({ archive: new Zip('file.zip'), entryPath: 'entry.rom' });
    const second = await ArchiveEntry.entryOf({ archive: new Zip('file.zip'), entryPath: 'entry.rom' });
    expect(first.equals(second)).toEqual(true);
    expect(second.equals(first)).toEqual(true);
  });

  it('should not equal a different entry', async () => {
    const first = await ArchiveEntry.entryOf({ archive: new Zip('file.zip'), entryPath: 'entry.rom' });
    const second = await ArchiveEntry.entryOf({ archive: new SevenZip('file.7z'), entryPath: 'entry.rom' });
    const third = await ArchiveEntry.entryOf({ archive: new Zip('file.zip'), entryPath: 'other.rom' });
    const fourth = await ArchiveEntry.entryOf({
      archive: new Zip('file.zip'),
      entryPath: 'entry.rom',
      size: 0,
      crc32: '12345678',
    });
    expect(first.equals(second)).toEqual(false);
    expect(second.equals(third)).toEqual(false);
    expect(third.equals(fourth)).toEqual(false);
    expect(fourth.equals(first)).toEqual(false);
  });
});
