import fs from 'fs';

import ROMScanner from '../../src/modules/romScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Options from '../../src/types/options.js';
import ROMFile from '../../src/types/romFile.js';
import ProgressBarFake from '../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', () => {
    const romFile = new ROMFile('/some/path', undefined, '00000000');
    expect(romFile.getFilePath()).toEqual('/some/path');
  });
});

describe('getArchiveEntryPath', () => {
  test.each([
    'something.rom',
    undefined,
  ])('should return the constructor value: %s', (archiveEntryPath) => {
    const romFile = new ROMFile('/some/path', archiveEntryPath, '00000000');
    expect(romFile.getArchiveEntryPath()).toEqual(archiveEntryPath);
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
    const romFile = new ROMFile('/some/path', undefined, crc);
    await expect(romFile.getCrc32()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.rom', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.rom', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the file path: %s', async (filePath, expectedCrc) => {
    const romFile = new ROMFile(filePath);
    await expect(romFile.getCrc32()).resolves.toEqual(expectedCrc);
  });
});

describe('isZip', () => {
  test.each([
    'file.zip',
    'foo/bar.zip',
    '/root.zip',
    '/UPPERCASE.ZIP',
  ])('should return true when appropriate', (filePath) => {
    const romFile = new ROMFile(filePath, undefined, '00000000');
    expect(romFile.isZip()).toEqual(true);
  });

  test.each([
    'file.rom',
    'fizz/buzz.rom',
    '/root.rom',
  ])('should return false when appropriate', (filePath) => {
    const romFile = new ROMFile(filePath, undefined, '00000000');
    expect(romFile.isZip()).toEqual(false);
  });
});

describe('toLocalFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
      const localFile = await raw.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      expect(localFile.getFilePath()).toEqual(raw.getFilePath());
      expect(localFile.getArchiveEntryPath()).toBeUndefined();
      expect(localFile.getCrc32()).toEqual(localFile.getCrc32());
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract zip files', async () => {
    const zips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/zip'],
    }), new ProgressBarFake()).scan();
    expect(zips.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < zips.length; i += 1) {
      const zip = zips[i];
      const localFile = await zip.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      expect(localFile.getFilePath()).not.toEqual(zip.getFilePath());
      expect(localFile.getArchiveEntryPath()).toBeUndefined();
      expect(localFile.getCrc32()).toEqual(localFile.getCrc32());
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract 7z files', async () => {
    const sevenZips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/7z'],
    }), new ProgressBarFake()).scan();
    expect(sevenZips.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < sevenZips.length; i += 1) {
      const sevenZip = sevenZips[i];
      const localFile = await sevenZip.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      expect(localFile.getFilePath()).not.toEqual(sevenZip.getFilePath());
      expect(localFile.getArchiveEntryPath()).toBeUndefined();
      expect(localFile.getCrc32()).toEqual(localFile.getCrc32());
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should throw an error on unknown archives', async () => {
    const romFile = new ROMFile('image.iso', 'file.rom', '00000000');
    const temp = fsPoly.mkdtempSync();
    await expect(romFile.toLocalFile(temp)).rejects.toThrow(/unknown/i);
    fsPoly.rmSync(temp, { recursive: true });
  });
});

describe('cleanupLocalFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
      const localFile = await raw.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      localFile.cleanupLocalFile();
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract zip files', async () => {
    const zips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/zip'],
    }), new ProgressBarFake()).scan();
    expect(zips.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < zips.length; i += 1) {
      const zip = zips[i];
      const localFile = await zip.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      localFile.cleanupLocalFile();
      expect(fs.existsSync(localFile.getFilePath())).toEqual(false);
    }
    fsPoly.rmSync(temp, { recursive: true });
  });

  it('should extract 7z files', async () => {
    const sevenZips = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/7z'],
    }), new ProgressBarFake()).scan();
    expect(sevenZips.length).toBeGreaterThan(0);

    const temp = fsPoly.mkdtempSync();
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < sevenZips.length; i += 1) {
      const sevenZip = sevenZips[i];
      const localFile = await sevenZip.toLocalFile(temp);
      expect(fs.existsSync(localFile.getFilePath())).toEqual(true);
      localFile.cleanupLocalFile();
      expect(fs.existsSync(localFile.getFilePath())).toEqual(false);
    }
    fsPoly.rmSync(temp, { recursive: true });
  });
});

describe('equals', () => {
  it('should be equal itself', async () => {
    const romFile = new ROMFile('file.rom', undefined, '00000000');
    await expect(romFile.equals(romFile)).resolves.toEqual(true);
  });

  it('should deep equal a raw file', async () => {
    const first = new ROMFile('file.rom', undefined, '00000000');
    const second = new ROMFile('file.rom', undefined, '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
  });

  it('should deep equal an archive file', async () => {
    const first = new ROMFile('file.zip', 'file.rom', '00000000');
    const second = new ROMFile('file.zip', 'file.rom', '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
  });
});
