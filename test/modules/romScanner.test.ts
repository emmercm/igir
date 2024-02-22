import os from 'node:os';
import path from 'node:path';

import Constants from '../../src/constants.js';
import ROMScanner from '../../src/modules/romScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

function createRomScanner(input: string[], inputExclude: string[] = []): ROMScanner {
  return new ROMScanner(new Options({ input, inputExclude }), new ProgressBarFake());
}

it('should throw on nonexistent paths', async () => {
  await expect(createRomScanner(['/completely/invalid/path']).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner(['/completely/invalid/path', 'test/fixtures/roms']).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner(['test/fixtures/roms/*foo*/*bar*']).scan()).rejects.toThrow(/no files found/i);
});

it('should return empty list on no results', async () => {
  await expect(createRomScanner([]).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner(['']).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner([os.devNull]).scan()).resolves.toHaveLength(0);
});

it('should not throw on bad archives', async () => {
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.zip']).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.rar']).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.7z']).scan()).resolves.toHaveLength(0);
});

describe('multiple files', () => {
  it('should scan multiple files with no exclusions', async () => {
    const expectedRomFiles = 61;
    await expect(createRomScanner(['test/fixtures/roms']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/*', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*.{rom,zip}']).scan()).resolves.toHaveLength(expectedRomFiles);
  });

  it('should scan multiple files with some file exclusions', async () => {
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom']).scan()).resolves.toHaveLength(44);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.rom']).scan()).resolves.toHaveLength(44);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.zip']).scan()).resolves.toHaveLength(33);
  });

  it('should scan multiple files with every file excluded', async () => {
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/*', 'test/fixtures/roms/*/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.zip', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
  });

  it('should scan symlinked files', async () => {
    const scannedRealFiles = (await createRomScanner(['test/fixtures/roms']).scan())
      .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

    // Given some symlinked files
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      const romFiles = await fsPoly.walk('test/fixtures/roms');
      await Promise.all(romFiles.map(async (romFile) => {
        const tempLink = path.join(tempDir, romFile);
        await fsPoly.mkdir(path.dirname(tempLink), { recursive: true });
        // TODO(cemmer): test relative symlinks
        await fsPoly.symlink(path.resolve(romFile), tempLink);
      }));

      // When scanning symlinked files
      const scannedSymlinks = (await createRomScanner([tempDir]).scan())
        .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

      // Then the files scan successfully
      expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
      for (const [idx, scannedSymlink] of scannedSymlinks.entries()) {
        expect(scannedSymlink.getSize()).toEqual(scannedRealFiles[idx].getSize());
        expect(scannedSymlink.getCrc32()).toEqual(scannedRealFiles[idx].getCrc32());
      }
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should scan symlinked directories', async () => {
    const realRomDir = path.join('test', 'fixtures', 'roms');
    const romDirs = await fsPoly.dirs(realRomDir);

    const scannedRealFiles = (await createRomScanner(romDirs).scan())
      .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

    // Given some symlinked dirs
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      await Promise.all(romDirs.map(async (romDir) => {
        const tempLink = path.join(tempDir, romDir);
        await fsPoly.mkdir(path.dirname(tempLink), { recursive: true });
        // TODO(cemmer): test relative symlinks
        await fsPoly.symlink(path.resolve(romDir), tempLink);
      }));

      // When scanning symlink dirs
      const scannedSymlinks = (await createRomScanner([tempDir]).scan())
        .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

      // Then the dirs scan successfully
      expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
      for (const [idx, scannedSymlink] of scannedSymlinks.entries()) {
        expect(scannedSymlink.getSize()).toEqual(scannedRealFiles[idx].getSize());
        expect(scannedSymlink.getCrc32()).toEqual(scannedRealFiles[idx].getCrc32());
      }
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });
});

it('should scan single files', async () => {
  await expect(createRomScanner(['test/fixtures/roms/empty.*']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/*/empty.rom']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/roms/empty.rom']).scan()).resolves.toHaveLength(1);
});
