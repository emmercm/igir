import fs from 'fs';

import ROMScanner from '../../../src/modules/romScanner.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', () => {
    const file = new File('/some/path', undefined, '00000000');
    expect(file.getFilePath()).toEqual('/some/path');
  });
});

describe('getArchiveEntryPath', () => {
  test.each([
    'something.rom',
    undefined,
  ])('should return the constructor value: %s', (archiveEntryPath) => {
    const file = new File('/some/path', archiveEntryPath, '00000000');
    expect(file.getArchiveEntryPath()).toEqual(archiveEntryPath);
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
    const file = new File('/some/path', undefined, crc);
    await expect(file.getCrc32()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.rom', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.rom', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the file path: %s', async (filePath, expectedCrc) => {
    const file = new File(filePath);
    await expect(file.getCrc32()).resolves.toEqual(expectedCrc);
  });
});

describe('isZip', () => {
  test.each([
    'file.zip',
    'foo/bar.zip',
    '/root.zip',
    '/UPPERCASE.ZIP',
  ])('should return true when appropriate', (filePath) => {
    const file = new File(filePath, undefined, '00000000');
    expect(file.isZip()).toEqual(true);
  });

  test.each([
    'file.rom',
    'fizz/buzz.rom',
    '/root.rom',
    'archive.rar',
    'archive.7z',
  ])('should return false when appropriate', (filePath) => {
    const file = new File(filePath, undefined, '00000000');
    expect(file.isZip()).toEqual(false);
  });
});

describe('toLocalFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(5);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
      await raw.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).toEqual(raw.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract zip files', async () => {
    // Note: this will only return valid zips with at least one file
    const zips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/zip'],
    }), new ProgressBarFake()).scan();
    expect(zips).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < zips.length; i += 1) {
      const zip = zips[i];
      await zip.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(zip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract rar files', async () => {
    // Note: this will only return valid rars with at least one file
    const rars = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/rar'],
    }), new ProgressBarFake()).scan();
    expect(rars).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < rars.length; i += 1) {
      const rar = rars[i];
      await rar.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(rar.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract 7z files', async () => {
    // Note: this will only return valid 7z's with at least one file
    const sevenZips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/7z'],
    }), new ProgressBarFake()).scan();
    expect(sevenZips).toHaveLength(4);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < sevenZips.length; i += 1) {
      const sevenZip = sevenZips[i];
      await sevenZip.extract(temp, (localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).not.toEqual(sevenZip.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should throw an error on unknown archives', async () => {
    const file = new File('image.iso', 'file.rom', '00000000');
    const temp = fsPoly.mkdtempSync();
    await expect(file.extract(temp, () => {})).rejects.toThrow(/unknown/i);
    fsPoly.rmSync(temp, { recursive: true });
  });
});

describe('equals', () => {
  it('should be equal itself', async () => {
    const file = new File('file.rom', undefined, '00000000');
    await expect(file.equals(file)).resolves.toEqual(true);
  });

  it('should deep equal a raw file', async () => {
    const first = new File('file.rom', undefined, '00000000');
    const second = new File('file.rom', undefined, '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
  });

  it('should deep equal an archive file', async () => {
    const first = new File('file.zip', 'file.rom', '00000000');
    const second = new File('file.zip', 'file.rom', '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
  });
});
