import path from 'path';

import Constants from '../../src/constants.js';
import fsPoly from '../../src/polyfill/fsPoly.js';

describe('canSymlink', () => {
  it('should not throw', async () => {
    await expect(fsPoly.canSymlink(Constants.GLOBAL_TEMP_DIR)).resolves.not.toThrow();
  });
});

describe('isDirectory', () => {
  it('should return true for a directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    await expect(fsPoly.isDirectory(tempDir)).resolves.toEqual(true);
  });

  it('should return false for a file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.isDirectory(tempFile)).resolves.toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.isDirectory(tempFile)).resolves.toEqual(false);
  });
});

describe('isDirectorySync', () => {
  it('should return true for a directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    expect(fsPoly.isDirectorySync(tempDir)).toEqual(true);
  });

  it('should return false for a file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    expect(fsPoly.isDirectorySync(tempFile)).toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    expect(fsPoly.isDirectorySync(tempFile)).toEqual(false);
  });
});

describe('isSymlink', () => {
  it('should return true for a symlink', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.isSymlink(tempLink)).resolves.toEqual(true);
    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    await expect(fsPoly.isSymlink(tempDir)).resolves.toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.isSymlink(tempFile)).resolves.toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.isSymlink(tempFile)).resolves.toEqual(false);
  });
});

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
  it('should throw on missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(fsPoly.rm(tempFile)).rejects.toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(fsPoly.rm(tempFile, { force: true })).resolves.not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    await fsPoly.rm(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(true);
    await fsPoly.rm(tempDir);
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it('should not delete a symlink\'s target', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(true);
    await fsPoly.rm(tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    await fsPoly.rm(tempFile);
  });
});

describe('rmSync', () => {
  it('should throw on missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => fsPoly.rmSync(tempFile)).toThrow();
  });

  it('should not throw on missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => fsPoly.rmSync(tempFile, { force: true })).not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    fsPoly.rmSync(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(true);
    fsPoly.rmSync(tempDir);
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it('should not delete a symlink\'s target', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(true);
    fsPoly.rmSync(tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    fsPoly.rmSync(tempFile);
  });
});
