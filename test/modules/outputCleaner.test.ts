import { promises as fsPromises } from 'fs';
import path from 'path';

import OutputCleaner from '../../src/modules/outputCleaner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Options from '../../src/types/options.js';
import ROMFile from '../../src/types/romFile.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function copyDir(src: string, dest: string): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

async function runOutputCleaner(writtenFilePathsToExclude: string[]) {
  // Copy the fixture files to a temp directory
  const temp = fsPoly.mkdtempSync();
  await copyDir('./test/fixtures', temp);

  const writtenRomFilesToExclude = writtenFilePathsToExclude
    .map((filePath) => new ROMFile(path.join(temp, filePath), undefined, '00000000'));

  const before = fsPoly.walkSync(temp);
  expect(before.length).toBeGreaterThan(0);

  await new OutputCleaner(
    new Options({
      commands: ['move', 'clean'],
      input: [temp],
      output: temp,
    }),
    new ProgressBarFake(),
  ).clean(writtenRomFilesToExclude);
  const after = fsPoly.walkSync(temp);

  fsPoly.rmSync(temp, { recursive: true });

  return after
    .map((pathLike) => pathLike.replace(temp + path.sep, ''))
    .sort();
}

it('should delete nothing if nothing written', async () => {
  await expect(runOutputCleaner([])).resolves.toHaveLength(27);
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
