import path from 'path';

import OutputCleaner from '../../src/modules/outputCleaner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/file.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function runOutputCleaner(writtenFilePathsToExclude: string[]): Promise<string[]> {
  // Copy the fixture files to a temp directory
  const tempDir = fsPoly.mkdtempSync();
  fsPoly.copyDirSync('./test/fixtures', tempDir);

  const writtenRomFilesToExclude = writtenFilePathsToExclude
    .map((filePath) => new File(path.join(tempDir, filePath), undefined, '00000000'));

  const before = fsPoly.walkSync(tempDir);
  expect(before.length).toBeGreaterThan(0);

  await new OutputCleaner(
    new Options({
      commands: ['move', 'clean'],
      input: [tempDir],
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
  const existingFiles = fsPoly.walkSync('./test/fixtures')
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]/, ''));
  const filesRemaining = await runOutputCleaner([]);
  expect(filesRemaining).toEqual(existingFiles);
});

it('should delete nothing if all match', async () => {
  const existingFiles = fsPoly.walkSync('./test/fixtures')
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]/, ''));
  const filesRemaining = await runOutputCleaner(existingFiles);
  expect(filesRemaining).toEqual(existingFiles);
});

it('should delete some if some matched', async () => {
  const filesRemaining = await runOutputCleaner([
    path.join('roms', '7z', 'empty.7z'),
    path.join('roms', 'raw', 'fizzbuzz.rom'),
    path.join('roms', 'zip', 'foobar.zip'),
    'non-existent file',
  ]);
  expect(filesRemaining).toEqual([
    path.join('roms', '7z', 'empty.7z'),
    path.join('roms', 'raw', 'fizzbuzz.rom'),
    path.join('roms', 'zip', 'foobar.zip'),
  ]);
});

it('should delete everything if all unmatched', async () => {
  await expect(runOutputCleaner([
    'non-existent file',
  ])).resolves.toHaveLength(0);
});
