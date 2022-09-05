import fs from 'fs';

import ROMScanner from '../../../src/modules/romScanner.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

describe('getFilePath', () => {
  it('should return the constructor value', () => {
    const file = new File('/some/path', '00000000');
    expect(file.getFilePath()).toEqual('/some/path');
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
    const file = new File('/some/path', crc);
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

describe('extract', () => {
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
});

describe('equals', () => {
  it('should be equal itself', async () => {
    const file = new File('file.rom', '00000000');
    await expect(file.equals(file)).resolves.toEqual(true);
  });

  it('should deep equal a raw file', async () => {
    const first = new File('file.rom', '00000000');
    const second = new File('file.rom', '00000000');
    await expect(first.equals(second)).resolves.toEqual(true);
  });
});
