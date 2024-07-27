import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import DirectoryCleaner from '../../src/modules/directoryCleaner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

const ROM_FIXTURES_DIR = path.join('test', 'fixtures', 'roms');

interface CleanResult {
  cleanedPaths: string[],
  remainingPaths: string[],
  movedPaths: string[],
}

/**
 * NOTE(cemmer): for some entirely unexplainable reason, these tests will start to fail on Windows
 * if there are more than three of them running. See the absolute mad head-banging commit log in
 * https://github.com/emmercm/igir/pull/82. In a real world scenario the cleaner will only run once,
 * so it's fine if we implement some workarounds here.
 */
async function runOutputCleaner(
  optionsProps: OptionsProps,
  cleanExclude: string[],
  writtenFilePathsToExclude: string[],
): Promise<CleanResult> {
  // Copy the fixture files to a temp directory
  const tempInputDir = await fsPoly.mkdtemp(Temp.getTempDir());
  await fsPoly.copyDir(ROM_FIXTURES_DIR, tempInputDir);

  try {
    const writtenRomFilesToExclude = await Promise.all(writtenFilePathsToExclude
      .map(async (filePath) => File.fileOf({ filePath: path.join(tempInputDir, filePath) })));

    const before = await fsPoly.walk(tempInputDir);
    expect(before.length).toBeGreaterThan(0);

    const cleanedPaths = (await new DirectoryCleaner(
      new Options({
        ...optionsProps,
        commands: ['move', 'clean'],
        cleanExclude: cleanExclude.map((filePath) => path.join(tempInputDir, filePath)),
      }),
      new ProgressBarFake(),
    ).clean([tempInputDir], writtenRomFilesToExclude))
      .map((pathLike) => pathLike.replace(tempInputDir + path.sep, ''))
      .sort();

    const after = await fsPoly.walk(tempInputDir);
    const remainingPaths = after
      .map((pathLike) => pathLike.replace(tempInputDir + path.sep, ''))
      .sort();

    const movedPaths = optionsProps.cleanBackup !== undefined
      ? await fsPoly.walk(optionsProps.cleanBackup)
      : [];

    return {
      cleanedPaths,
      remainingPaths,
      movedPaths,
    };
  } finally {
    await fsPoly.rm(tempInputDir, { recursive: true, force: true });
  }
}

it('should delete nothing if nothing written', async () => {
  const existingFiles = (await fsPoly.walk(ROM_FIXTURES_DIR))
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const { remainingPaths } = await runOutputCleaner({}, [], []);
  expect(remainingPaths).toEqual(existingFiles);
});

it('should delete nothing if no excess files', async () => {
  const existingFiles = (await fsPoly.walk(ROM_FIXTURES_DIR))
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const { remainingPaths } = await runOutputCleaner({}, [], existingFiles);
  expect(remainingPaths).toEqual(existingFiles);
});

it('should delete some if all unmatched and some excluded', async () => {
  const { remainingPaths } = await runOutputCleaner({}, [
    path.join('**', 'foobar.*'),
  ], [
    'non-existent file',
  ]);
  expect(remainingPaths).toEqual([
    path.join('7z', 'foobar.7z'),
    'foobar.lnx',
    path.join('gz', 'foobar.gz'),
    path.join('rar', 'foobar.rar'),
    path.join('raw', 'foobar.lnx'),
    path.join('tar', 'foobar.tar.gz'),
    path.join('zip', 'foobar.zip'),
  ]);
});

it('should delete some if some matched and nothing excluded', async () => {
  const { remainingPaths } = await runOutputCleaner({}, [], [
    path.join('7z', 'empty.7z'),
    path.join('raw', 'fizzbuzz.nes'),
    path.join('zip', 'foobar.zip'),
    'non-existent file',
  ]);
  expect(remainingPaths).toEqual([
    path.join('7z', 'empty.7z'),
    path.join('raw', 'fizzbuzz.nes'),
    path.join('zip', 'foobar.zip'),
  ]);
});

it('should delete everything if all unmatched and nothing excluded', async () => {
  const { cleanedPaths, remainingPaths, movedPaths } = await runOutputCleaner({}, [], [
    'non-existent file',
  ]);
  expect(cleanedPaths.length).toBeGreaterThan(0);
  expect(remainingPaths).toHaveLength(0);
  expect(movedPaths).toHaveLength(0);
});

it('should move everything if all unmatched and nothing excluded', async () => {
  const tempMoveDir = await fsPoly.mkdtemp(Temp.getTempDir());
  try {
    const { cleanedPaths, remainingPaths, movedPaths } = await runOutputCleaner({
      cleanBackup: tempMoveDir,
    }, [], [
      'non-existent file',
    ]);
    expect(cleanedPaths.length).toBeGreaterThan(0);
    expect(remainingPaths).toHaveLength(0);
    expect(movedPaths).toHaveLength(cleanedPaths.length);
  } finally {
    await fsPoly.rm(tempMoveDir, { recursive: true, force: true });
  }
});

it('should delete nothing if all unmatched but doing a dry run', async () => {
  const existingFiles = (await fsPoly.walk(ROM_FIXTURES_DIR))
    .map((filePath) => filePath.replace(/^test[\\/]fixtures[\\/]roms[\\/]/, ''))
    .sort();
  const { remainingPaths } = await runOutputCleaner({
    cleanDryRun: true,
  }, [], [
    'non-existent file',
  ]);
  expect(remainingPaths).toEqual(existingFiles);
});

it('should delete hard links', async () => {
  const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
  try {
    const filesDir = path.join(tempDir, 'files');
    await fsPoly.mkdir(filesDir);
    const linksDir = path.join(tempDir, 'links');
    await fsPoly.mkdir(linksDir);

    const tempFileOne = await fsPoly.mktemp(path.join(filesDir, 'one'));
    await fsPoly.touch(tempFileOne);
    const tempLinkOne = await fsPoly.mktemp(path.join(linksDir, 'one'));
    await fsPoly.hardlink(tempFileOne, tempLinkOne);

    const tempFileTwo = await fsPoly.mktemp(path.join(filesDir, 'two'));
    await fsPoly.touch(tempFileTwo);
    const tempLinkTwo = await fsPoly.mktemp(path.join(linksDir, 'two'));
    await fsPoly.hardlink(tempFileTwo, tempLinkTwo);

    await new DirectoryCleaner(
      new Options({
        commands: ['move', 'clean'],
      }),
      new ProgressBarFake(),
    ).clean([linksDir], [await File.fileOf({ filePath: tempLinkOne })]);

    const remainingPaths = await fsPoly.walk(tempDir);
    expect(remainingPaths).toEqual([
      // Original files were preserved
      tempFileOne,
      tempFileTwo,
      // The excluded file was preserved
      tempLinkOne,
    ]);
  } finally {
    await fsPoly.rm(tempDir, { recursive: true });
  }
});

it('should delete symlinks', async () => {
  const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
  try {
    const filesDir = path.join(tempDir, 'files');
    await fsPoly.mkdir(filesDir);
    const linksDir = path.join(tempDir, 'links');
    await fsPoly.mkdir(linksDir);

    const tempFileOne = await fsPoly.mktemp(path.join(filesDir, 'one'));
    await fsPoly.touch(tempFileOne);
    const tempLinkOne = await fsPoly.mktemp(path.join(linksDir, 'one'));
    await fsPoly.symlink(tempFileOne, tempLinkOne);

    const tempFileTwo = await fsPoly.mktemp(path.join(filesDir, 'two'));
    await fsPoly.touch(tempFileTwo);
    const tempLinkTwo = await fsPoly.mktemp(path.join(linksDir, 'two'));
    await fsPoly.symlink(tempFileTwo, tempLinkTwo);

    await new DirectoryCleaner(
      new Options({
        commands: ['move', 'clean'],
      }),
      new ProgressBarFake(),
    ).clean([linksDir], [await File.fileOf({ filePath: tempLinkOne })]);

    const remainingPaths = await fsPoly.walk(tempDir);
    expect(remainingPaths).toEqual([
      // Original files were preserved
      tempFileOne,
      tempFileTwo,
      // The excluded file was preserved
      tempLinkOne,
    ]);
  } finally {
    await fsPoly.rm(tempDir, { recursive: true });
  }
});
