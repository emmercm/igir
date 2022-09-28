import fs from 'fs';
import path from 'path';

import Constants from '../../../src/constants.js';
import ROMScanner from '../../../src/modules/romScanner.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import FileHeader from '../../../src/types/files/fileHeader.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', () => {
    const file = new File(path.join('some', 'path'), 0, '00000000');
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
    const file = new File(path.join('some', 'path'), 0, crc);
    await expect(file.getCrc32()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/empty.rom', '00000000'],
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/raw/loremipsum.rom', '70856527'],
  ])('should hash the full file: %s', async (filePath, expectedCrc) => {
    const file = new File(filePath);
    await expect(file.getCrc32()).resolves.toEqual(expectedCrc);
  });
});

describe('getCrc32WithoutHeader', () => {
  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '9180a163'],
  ])('should hash the full file when no header given: %s', async (filePath, expectedCrc) => {
    const file = new File(filePath);
    await expect(file.getCrc32WithoutHeader()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/raw/fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/raw/foobar.lnx', 'b22c9747'],
  ])('should hash the full file when header is given but not present in file: %s', async (filePath, expectedCrc) => {
    const file = await new File(filePath)
      .withFileHeader(FileHeader.getForFilename(filePath) as FileHeader);
    await expect(file.getCrc32WithoutHeader()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/headered/allpads.nes', '6339abe6'],
  ])('should hash the full file when header is given and present in file: %s', async (filePath, expectedCrc) => {
    const file = await new File(filePath)
      .withFileHeader(FileHeader.getForFilename(filePath) as FileHeader);
    await expect(file.getCrc32WithoutHeader()).resolves.toEqual(expectedCrc);
  });
});

describe('extractToFile', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(8);

    const temp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
      await raw.extractToFile((localFile) => {
        expect(fs.existsSync(localFile)).toEqual(true);
        expect(localFile).toEqual(raw.getFilePath());
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });
});

describe('extractToStream', () => {
  it('should do nothing with no archive entry path', async () => {
    const raws = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/raw/!(empty).*'],
    }), new ProgressBarFake()).scan();
    expect(raws).toHaveLength(7);

    const temp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < raws.length; i += 1) {
      const raw = raws[i];
      await raw.extractToStream(async (stream) => {
        const contents = (await bufferPoly.fromReadable(stream)).toString();
        expect(contents).toBeTruthy();
      });
    }
    fsPoly.rmSync(temp, { recursive: true });
  });
});

describe('equals', () => {
  it('should equal itself', async () => {
    const file = new File('file.rom', 0, '00000000');
    await expect(file.equals(file)).resolves.toEqual(true);
  });

  it('should equal the same file', async () => {
    const first = new File('file.rom', 0, '00000000');
    const second = new File('file.rom', 0, '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
    await expect(second.equals(first)).resolves.toEqual(true);
  });

  it('should not equal a different file', async () => {
    const first = new File('file.rom', 0, '00000000');
    const second = new File('other.rom', 0, '00000000');
    const third = new File('file.rom', 0, '12345678');
    await expect(first.equals(second)).resolves.toEqual(false);
    await expect(second.equals(third)).resolves.toEqual(false);
    await expect(third.equals(first)).resolves.toEqual(false);
  });
});
