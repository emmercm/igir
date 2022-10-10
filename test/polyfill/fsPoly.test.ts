import path from 'path';

import fsPoly from '../../src/polyfill/fsPoly.js';

describe('makeLegal', () => {
  describe('unix', () => {
    test.each([
      // Test equality
      ['file.rom', 'file.rom'],
      ['roms/file.rom', 'roms/file.rom'],
      ['/roms/file.rom', '/roms/file.rom'],
      // Test illegal names
      ['Dwayne "The Rock" Jonson.rom', 'Dwayne _The Rock_ Jonson.rom'],
    ])('should make the file path legal: %s', (input, expected) => {
      expect(fsPoly.makeLegal(input, '/')).toEqual(expected);
    });
  });

  describe('windows', () => {
    test.each([
      // Test equality
      ['file.rom', 'file.rom'],
      ['roms\\file.rom', 'roms\\file.rom'],
      ['C:\\roms\\file.rom', 'C:\\roms\\file.rom'],
      // Test drive letter semicolon preservation
      ['C:\\ro:ms\\fi:le.rom', 'C:\\ro;ms\\fi;le.rom'],
      // Test illegal names
      ['Dwayne "The Rock" Jonson.rom', 'Dwayne _The Rock_ Jonson.rom'],
    ])('should make the file path legal: %s', (input, expected) => {
      expect(fsPoly.makeLegal(input, '\\')).toEqual(expected);
    });
  });
});

describe('rm', () => {
  it('should delete an existing file', async () => {
    const file = fsPoly.mktempSync(path.join(process.cwd(), 'temp'));
    await fsPoly.touch(file);
    await fsPoly.rm(file);
    await expect(fsPoly.exists(file)).resolves.toEqual(false);
  });
});

describe('rmSync', () => {
  it('should delete an existing file', async () => {
    const file = fsPoly.mktempSync(path.join(process.cwd(), 'temp'));
    await fsPoly.touch(file);
    fsPoly.rmSync(file);
    await expect(fsPoly.exists(file)).resolves.toEqual(false);
  });
});
