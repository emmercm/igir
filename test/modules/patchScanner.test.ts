import os from 'os';

import PatchScanner from '../../src/modules/patchScanner.js';
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

it('should scan multiple files', async () => {
  const expectedPatchFiles = 7;
  await expect(createPatchScanner(['test/fixtures/patches/*']).scan()).resolves.toHaveLength(expectedPatchFiles);
  await expect(createPatchScanner(['test/fixtures/patches/**/*']).scan()).resolves.toHaveLength(expectedPatchFiles);
  await expect(createPatchScanner(['test/fixtures/*/*.{bps,ips,ips32,ppf,rup,ups,vcdiff,xdelta}']).scan()).resolves.toHaveLength(expectedPatchFiles);
});

it('should scan single files', async () => {
  await expect(createPatchScanner(['test/fixtures/patches/After*.ips']).scan()).resolves.toHaveLength(1);
  await expect(createPatchScanner(['test/fixtures/*/After*.ips']).scan()).resolves.toHaveLength(1);
});
