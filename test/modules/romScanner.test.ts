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
    await using disposableStack = new AsyncDisposableStack();

    const scannedRealFiles = (await createRomScanner(['test/fixtures/roms']).scan())
      .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    disposableStack.defer(async () => fsPoly.rm(tempDir, { recursive: true }));

    const romFiles = await fsPoly.walk('test/fixtures/roms');
    await Promise.all(romFiles.map(async (romFile) => {
      const tempLink = path.join(tempDir, romFile);
      await fsPoly.mkdir(path.dirname(tempLink), { recursive: true });
      await fsPoly.symlink(path.resolve(romFile), tempLink);
    }));
    const scannedSymlinks = (await createRomScanner([tempDir]).scan())
      .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));

    expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
    for (let i = 0; i < scannedSymlinks.length; i += 1) {
      expect(scannedSymlinks[i].getSize()).toEqual(scannedRealFiles[i].getSize());
      expect(scannedSymlinks[i].getCrc32()).toEqual(scannedRealFiles[i].getCrc32());
    }
  });
});

it('should scan single files', async () => {
  await expect(createRomScanner(['test/fixtures/roms/empty.*']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/*/empty.rom']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/roms/empty.rom']).scan()).resolves.toHaveLength(1);
});
