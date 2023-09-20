import path from 'node:path';

import Constants from '../../../../src/constants.js';
import ROMScanner from '../../../../src/modules/romScanner.js';
import bufferPoly from '../../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import SevenZip from '../../../../src/types/files/archives/sevenZip.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import File from '../../../../src/types/files/file.js';
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
    const archiveEntry = await ArchiveEntry.entryOf(archive, archiveEntryPath, 0, '00000000');
    expect(archiveEntry.getEntryPath()).toEqual(archiveEntryPath);
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

    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
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

    expect(archiveEntry.getCrc32WithoutHeader()).toEqual(expectedCrc);
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
  });
});

describe('copyToTempFile', () => {
  it('should extract archived files', async () => {
    // Note: this will only return valid archives with at least one file
    const archiveEntries = await new ROMScanner(new Options({
      input: [
        './test/fixtures/roms/zip',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/7z',
      ],
    }), new ProgressBarFake()).scan();
    expect(archiveEntries).toHaveLength(23);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (let i = 0; i < archiveEntries.length; i += 1) {
      const archiveEntry = archiveEntries[i];
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
        './test/fixtures/roms/zip',
        './test/fixtures/roms/rar',
        './test/fixtures/roms/7z',
      ],
    }), new ProgressBarFake()).scan();
    expect(archiveEntries).toHaveLength(23);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (let i = 0; i < archiveEntries.length; i += 1) {
      const archiveEntry = archiveEntries[i];
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
    const entry = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '00000000');
    const patch = IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'));
    const patchedEntry = entry.withPatch(patch);
    expect(patchedEntry.getPatch()).toEqual(patch);
  });

  it('should not attach a non-matching patch', async () => {
    const entry = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, 'FFFFFFFF');
    const patch = IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'));
    const patchedEntry = entry.withPatch(patch);
    expect(patchedEntry.getPatch()).toBeUndefined();
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const entry = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '00000000');
    expect(entry.equals(entry)).toEqual(true);
  });

  it('should equal the same entry', async () => {
    const first = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '00000000');
    const second = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '00000000');
    expect(first.equals(second)).toEqual(true);
    expect(second.equals(first)).toEqual(true);
  });

  it('should not equal a different entry', async () => {
    const first = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '00000000');
    const second = await ArchiveEntry.entryOf(new SevenZip('file.7z'), 'entry.rom', 0, '00000000');
    const third = await ArchiveEntry.entryOf(new Zip('file.zip'), 'other.rom', 0, '00000000');
    const fourth = await ArchiveEntry.entryOf(new Zip('file.zip'), 'entry.rom', 0, '12345678');
    expect(first.equals(second)).toEqual(false);
    expect(second.equals(third)).toEqual(false);
    expect(third.equals(fourth)).toEqual(false);
    expect(fourth.equals(first)).toEqual(false);
  });
});
