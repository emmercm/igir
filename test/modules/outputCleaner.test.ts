import { jest } from '@jest/globals';
import path from 'path';

import Constants from '../../src/constants.js';
import OutputCleaner from '../../src/modules/outputCleaner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

jest.setTimeout(10_000);

const romFixtures = path.join('test', 'fixtures', 'roms');

async function runOutputCleaner(writtenFilePathsToExclude: string[]): Promise<string[]> {
  // Copy the fixture files to a temp directory
  const tempDir = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync(romFixtures, tempDir);

  const writtenRomFilesToExclude = writtenFilePathsToExclude
    .map((filePath) => new File(path.join(tempDir, filePath), 0, '00000000'));

  const before = fsPoly.walkSync(tempDir);
  expect(before.length).toBeGreaterThan(0);

  await new OutputCleaner(
    new Options({
      commands: ['move', 'clean'],
      output: tempDir,
    }),
    new ProgressBarFake(),
  ).clean(writtenRomFilesToExclude);
  const after = fsPoly.walkSync(tempDir);

  fsPoly.rmSync(tempDir, { recursive: true });

  return after
    .map((pathLike) => pathLike.replace(tempDir + path.sep, ''))
    .sort();
}

it('should delete nothing if nothing written', async () => {
  const existingFiles = fsPoly.walkSync(romFixtures)
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const filesRemaining = await runOutputCleaner([]);
  expect(filesRemaining).toEqual(existingFiles);
});

it('should delete nothing if all match', async () => {
  const existingFiles = fsPoly.walkSync(romFixtures)
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const filesRemaining = await runOutputCleaner(existingFiles);
  expect(filesRemaining).toEqual(existingFiles);
});

// it('should delete some if some matched', async () => {
//   const filesRemaining = await runOutputCleaner([
//     path.join('7z', 'empty.7z'),
//     path.join('raw', 'fizzbuzz.nes'),
//     path.join('zip', 'foobar.zip'),
//     'non-existent file',
//   ]);
//   expect(filesRemaining).toEqual([
//     path.join('7z', 'empty.7z'),
//     path.join('raw', 'fizzbuzz.nes'),
//     path.join('zip', 'foobar.zip'),
//   ]);
// });

it('should delete everything if all unmatched', async () => {
  await expect(runOutputCleaner([
    'non-existent file',
  ])).resolves.toEqual([]);
});
