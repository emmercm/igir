import os from 'os';

import ROMScanner from '../../src/modules/romScanner.js';
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
  it('no files are path excluded', async () => {
    const expectedRomFiles = 55;
    await expect(createRomScanner(['test/fixtures/roms']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/*', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(expectedRomFiles);
    await expect(createRomScanner(['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*.{rom,zip}']).scan()).resolves.toHaveLength(expectedRomFiles);
  });

  it('some files are path excluded', async () => {
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom']).scan()).resolves.toHaveLength(42);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.rom']).scan()).resolves.toHaveLength(42);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.zip']).scan()).resolves.toHaveLength(33);
  });

  it('all files are path excluded', async () => {
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/*', 'test/fixtures/roms/*/**/*']).scan()).resolves.toHaveLength(0);
    await expect(createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.zip', 'test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
  });
});

it('should scan single files', async () => {
  await expect(createRomScanner(['test/fixtures/roms/empty.*']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/*/empty.rom']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/roms/empty.rom']).scan()).resolves.toHaveLength(1);
});
