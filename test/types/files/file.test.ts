import path from 'path';

import Constants from '../../../src/constants.js';
import ROMScanner from '../../../src/modules/romScanner.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import Options from '../../../src/types/options.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', async () => {
    const file = await File.fileOf(path.join('some', 'path'), 0, '00000000');
    expect(file.getFilePath()).toEqual(path.join('some', 'path'));
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
    const file = await File.fileOf(path.join('some', 'path'), 0, crc);
    expect(file.getCrc32()).toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the full file: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath);
    expect(file.getCrc32()).toEqual(expectedCrc);
  });
});

describe('getCrc32WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '9180a163'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '9adca6cc'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
  ])('should hash the full file when header is given but not present in file: %s', async (filePath, expectedCrc) => {
    const file = await (await File.fileOf(filePath))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '6339abe6'],
    ['./test/fixtures/roms/headered/speed_test_v51.smc', '8beffd94'],
  ])('should hash the file without the header when header is given and present in file: %s', async (filePath, expectedCrc) => {
    const file = await (await File.fileOf(filePath))
      .withFileHeader(ROMHeader.headerFromFilename(filePath) as ROMHeader);
    expect(file.getCrc32WithoutHeader()).toEqual(expectedCrc);
  });
});

describe('getSymlinkSourceResolved', () => {
  it('should not resolve non-symlinks', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'file')));
      const fileLink = await File.fileOf(tempFile);
      expect(fileLink.getSymlinkSourceResolved()).toBeUndefined();
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should resolve absolute symlinks', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'dir1', 'file')));
      await fsPoly.mkdir(path.dirname(tempFile), { recursive: true });
      await fsPoly.touch(tempFile);

      const tempLink = await fsPoly.mktemp(path.join(tempDir, 'dir2', 'link'));
      await fsPoly.mkdir(path.dirname(tempLink), { recursive: true });
      await fsPoly.symlink(path.resolve(tempFile), tempLink);
      const fileLink = await File.fileOf(tempLink);

      expect(fileLink.getSymlinkSourceResolved()).toEqual(tempFile);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should resolve relative symlinks', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      const tempFile = path.resolve(await fsPoly.mktemp(path.join(tempDir, 'dir1', 'file')));
      await fsPoly.mkdir(path.dirname(tempFile), { recursive: true });
      await fsPoly.touch(tempFile);

      const tempLink = await fsPoly.mktemp(path.join(tempDir, 'dir2', 'link'));
      await fsPoly.mkdir(path.dirname(tempLink), { recursive: true });
      await fsPoly.symlink(path.relative(path.dirname(tempLink), tempFile), tempLink);
      const fileLink = await File.fileOf(tempLink);

      expect(fileLink.getSymlinkSourceResolved()).toEqual(tempFile);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });
});

describe('copyToTempFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(10);

    const temp = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
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
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
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
    const file = await File.fileOf('file.rom', 0, '00000000');
    const patch = IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'));
    const patchedFile = file.withPatch(patch);
    expect(patchedFile.getPatch()).toEqual(patch);
  });

  it('should not attach a non-matching patch', async () => {
    const file = await File.fileOf('file.rom', 0, 'FFFFFFFF');
    const patch = IPSPatch.patchFrom(await File.fileOf('patch 00000000.ips'));
    const patchedFile = file.withPatch(patch);
    expect(patchedFile.getPatch()).toBeUndefined();
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const file = await File.fileOf('file.rom', 0, '00000000');
    expect(file.equals(file)).toEqual(true);
  });

  it('should equal the same file', async () => {
    const first = await File.fileOf('file.rom', 0, '00000000');
    const second = await File.fileOf('file.rom', 0, '00000000');
    expect(first.equals(second)).toEqual(true);
    expect(second.equals(first)).toEqual(true);
  });

  it('should not equal a different file', async () => {
    const first = await File.fileOf('file.rom', 0, '00000000');
    const second = await File.fileOf('other.rom', 0, '00000000');
    const third = await File.fileOf('file.rom', 0, '12345678');
    expect(first.equals(second)).toEqual(false);
    expect(second.equals(third)).toEqual(false);
    expect(third.equals(first)).toEqual(false);
  });
});
