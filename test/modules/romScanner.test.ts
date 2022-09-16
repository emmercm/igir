import { jest } from '@jest/globals';
import os from 'os';

import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

jest.setTimeout(10_000);

function createRomScanner(input: string[], inputExclude: string[] = []): ROMScanner {
  return new ROMScanner(Options.fromObject({ input, inputExclude }), new ProgressBarFake());
}

it('should throw on nonexistent paths', async () => {
  await expect(createRomScanner(['/completely/invalid/path']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createRomScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createRomScanner(['/completely/invalid/path', 'test/fixtures/roms']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createRomScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createRomScanner(['test/fixtures/roms/*foo*/*bar*']).scan()).rejects.toThrow(/path doesn't exist/i);
});

it('should return empty list on no results', async () => {
  await expect(createRomScanner([]).scan()).resolves.toEqual([]);
  await expect(createRomScanner(['']).scan()).resolves.toEqual([]);
  await expect(createRomScanner([os.devNull]).scan()).resolves.toEqual([]);
});

it('should return empty list when input matches inputExclude', async () => {
  // TODO(cemmer)
});

it('should not throw on bad archives', async () => {
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.zip']).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.rar']).scan()).resolves.toHaveLength(0);
  await expect(createRomScanner(['test/fixtures/roms/**/invalid.7z']).scan()).resolves.toHaveLength(0);
});

it('should scan multiple files', async () => {
  const expectedRomFiles = 26;
  await expect(createRomScanner(['test/fixtures/roms']).scan()).resolves.toHaveLength(expectedRomFiles);
  await expect(createRomScanner(['test/fixtures/roms/*', 'test/fixtures/roms/**/*.{rom,nes,zip,rar,7z}']).scan()).resolves.toHaveLength(expectedRomFiles);
  await expect(createRomScanner(['test/fixtures/roms/**/*.{rom,nes,zip,rar,7z}']).scan()).resolves.toHaveLength(expectedRomFiles);
  await expect(createRomScanner(['test/fixtures/roms/**/*.{rom,nes,zip,rar,7z}', 'test/fixtures/roms/**/*.{rom,nes,zip,rar,7z}']).scan()).resolves.toHaveLength(expectedRomFiles);
});

it('should scan single files', async () => {
  await expect(createRomScanner(['test/fixtures/roms/empty.*']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/*/empty.rom']).scan()).resolves.toHaveLength(1);
  await expect(createRomScanner(['test/fixtures/roms/empty.rom']).scan()).resolves.toHaveLength(1);
});
