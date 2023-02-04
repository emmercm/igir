import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import PatchScanner from '../../src/modules/patchScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import FileFactory from '../../src/types/archives/fileFactory.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

function createPatchScanner(patch: string[]): PatchScanner {
  return new PatchScanner(new Options({ patch }), new ProgressBarFake());
}

it('should throw on nonexistent paths', async () => {
  await expect(createPatchScanner(['/completely/invalid/path']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createPatchScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createPatchScanner(['/completely/invalid/path', 'test/fixtures/roms']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createPatchScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(/path doesn't exist/i);
  await expect(createPatchScanner(['test/fixtures/roms/*foo*/*bar*']).scan()).rejects.toThrow(/path doesn't exist/i);
});

it('should return empty list on no results', async () => {
  await expect(createPatchScanner([]).scan()).resolves.toEqual([]);
  await expect(createPatchScanner(['']).scan()).resolves.toEqual([]);
  await expect(createPatchScanner([os.devNull]).scan()).resolves.toEqual([]);
});

it('should return empty list on non-patches', async () => {
  await expect(createPatchScanner(['test/fixtures/dats/**/*']).scan()).resolves.toHaveLength(0);
  await expect(createPatchScanner(['test/fixtures/roms/**/*']).scan()).resolves.toHaveLength(0);
});

it('should scan single files', async () => {
  await expect(createPatchScanner(['test/fixtures/patches/After*.ips']).scan()).resolves.toHaveLength(1);
  await expect(createPatchScanner(['test/fixtures/*/After*.ips']).scan()).resolves.toHaveLength(1);
});

it('should scan multiple files', async () => {
  const expectedPatchFiles = 7;
  await expect(createPatchScanner(['test/fixtures/patches/*']).scan()).resolves.toHaveLength(expectedPatchFiles);
  await expect(createPatchScanner(['test/fixtures/patches/**/*']).scan()).resolves.toHaveLength(expectedPatchFiles);
  await expect(createPatchScanner(['test/fixtures/*/*.{bps,ips,ips32,ppf,rup,ups,vcdiff,xdelta}']).scan()).resolves.toHaveLength(expectedPatchFiles);
});

it('should scan multiple files of incorrect extensions', async () => {
  const patchFiles = (await new Options({ patch: ['test/fixtures/patches/*'] }).scanPatchFiles())
    .filter((filePath) => !FileFactory.isArchive(filePath));

  const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
  try {
    const tempFiles = await Promise.all(patchFiles.map(async (patchFile) => {
      const tempFile = path.join(tempDir, `${path.basename(patchFile)}.txt`);
      await fsPoly.copyFile(patchFile, tempFile);
      return tempFile;
    }));
    expect(tempFiles.length).toBeGreaterThan(0);
    await expect(createPatchScanner(tempFiles).scan()).resolves.toHaveLength(tempFiles.length);
  } finally {
    await fsPoly.rm(tempDir, { recursive: true });
  }
});
