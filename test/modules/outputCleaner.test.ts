import { jest } from '@jest/globals';
import path from 'path';

import Constants from '../../src/constants.js';
import OutputCleaner from '../../src/modules/outputCleaner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

jest.setTimeout(10_000);

const ROM_FIXTURES_DIR = path.join('test', 'fixtures', 'roms');

/**
 * NOTE(cemmer): for some entirely unexplainable reason, these tests will start to fail on Windows
 * if there are more than three of them running. See the absolute mad head-banging commit log in
 * https://github.com/emmercm/igir/pull/82. In a real world scenario the cleaner will only run once,
 * so it's fine if we implement some workarounds here.
 */
async function runOutputCleaner(writtenFilePathsToExclude: string[]): Promise<string[]> {
  // Copy the fixture files to a temp directory
  const tempDir = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync(ROM_FIXTURES_DIR, tempDir);

  const writtenRomFilesToExclude = await Promise.all(writtenFilePathsToExclude
    .map(async (filePath) => File.fileOf(path.join(tempDir, filePath), 0, '00000000')));

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
  const existingFiles = fsPoly.walkSync(ROM_FIXTURES_DIR)
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const filesRemaining = await runOutputCleaner([]);
  expect(filesRemaining).toEqual(existingFiles);
});

it('should delete nothing if all match', async () => {
  const existingFiles = fsPoly.walkSync(ROM_FIXTURES_DIR)
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const filesRemaining = await runOutputCleaner(existingFiles);
  expect(filesRemaining).toEqual(existingFiles);
});

it('should delete some if some matched', async () => {
  const filesRemaining = await runOutputCleaner([
    path.join('7z', 'empty.7z'),
    path.join('raw', 'fizzbuzz.nes'),
    path.join('zip', 'foobar.zip'),
    'non-existent file',
  ]);
  expect(filesRemaining).toEqual([
    path.join('7z', 'empty.7z'),
    path.join('raw', 'fizzbuzz.nes'),
    path.join('zip', 'foobar.zip'),
  ]);
});

it('should delete everything if all unmatched', async () => {
  await expect(runOutputCleaner([
    'non-existent file',
  ])).resolves.toEqual([]);
});
