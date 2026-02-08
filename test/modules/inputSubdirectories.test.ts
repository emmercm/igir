import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import InputSubdirectoriesDeleter from '../../src/modules/inputSubdirectoriesDeleter.js';
import FsPoly, { WalkMode } from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import Options, { MoveDeleteDirs, MoveDeleteDirsInverted } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function createTempFiles(): Promise<string> {
  const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
  try {
    await FsPoly.mkdir(path.join(tempDir, 'GB', 'EUR'), { recursive: true });
    await FsPoly.touch(
      path.join(tempDir, 'GB', 'JPN', 'Gojira-kun - Kaijuu Daikoushin (Japan).gb'),
    );
    await FsPoly.touch(
      path.join(tempDir, 'GB', 'USA', 'Contra - The Alien Wars (USA) (SGB Enhanced).gb'),
    );
    await FsPoly.touch(path.join(tempDir, 'GB', 'USA', 'Shaq Fu (USA) (SGB Enhanced).gb'));

    await FsPoly.touch(path.join(tempDir, 'NES', 'EUR', 'Double Dragon (Europe).nes'));
    await FsPoly.mkdir(path.join(tempDir, 'NES', 'JPN'), { recursive: true });
    await FsPoly.touch(path.join(tempDir, 'NES', 'USA', 'Dragon Warrior (USA) (Rev 1).nes'));
    await FsPoly.touch(path.join(tempDir, 'NES', 'USA', 'Rainbow Islands (USA).nes'));
  } catch (error) {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
  return tempDir;
}

it('should do nothing if not moving files', async () => {
  const tempDir = await createTempFiles();
  try {
    const options = new Options({
      commands: ['copy'],
      input: [tempDir],
      moveDeleteDirs: MoveDeleteDirsInverted[MoveDeleteDirs.AUTO].toLowerCase(),
    });

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      [],
    );

    // No directories were deleted
    expect(deletedDirs).toHaveLength(0);
  } finally {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
  }
});

it('should do nothing if option is "never"', async () => {
  const tempDir = await createTempFiles();
  try {
    const options = new Options({
      commands: ['move'],
      input: [tempDir],
      moveDeleteDirs: MoveDeleteDirsInverted[MoveDeleteDirs.NEVER].toLowerCase(),
    });

    // Files were moved, and they're no longer in the input directory
    const tempFilePaths = await FsPoly.walk(tempDir, WalkMode.FILES);
    const tempFiles = await Promise.all(
      tempFilePaths.map(async (filePath) => File.fileOf({ filePath })),
    );
    await Promise.all(tempFilePaths.map(async (filePath) => FsPoly.rm(filePath)));

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      tempFiles,
    );

    // No directories were deleted
    expect(deletedDirs).toHaveLength(0);
  } finally {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
  }
});

it('should do nothing if no ROMs were moved and option isn\'t "always"', async () => {
  const tempDir = await createTempFiles();
  try {
    const options = new Options({
      commands: ['move'],
      input: [tempDir],
      moveDeleteDirs: MoveDeleteDirsInverted[MoveDeleteDirs.AUTO].toLowerCase(),
    });

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      [],
    );

    // No directories were deleted
    expect(deletedDirs).toHaveLength(0);
  } finally {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
  }
});

it('should delete empty directories even if no ROMs were moved when option is "always"', async () => {
  const tempDir = await createTempFiles();
  try {
    const options = new Options({
      commands: ['move'],
      input: [tempDir],
      moveDeleteDirs: MoveDeleteDirsInverted[MoveDeleteDirs.ALWAYS].toLowerCase(),
    });

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      [],
    );

    // The directories that had files moved out of them were deleted
    expect(
      deletedDirs.map((dirPath) => dirPath.replace(tempDir + path.sep, '')).toSorted(),
    ).toEqual([path.join('GB', 'EUR'), path.join('NES', 'JPN')]);
  } finally {
    await FsPoly.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});

it('should delete empty directories that had ROMs moved out of them', async () => {
  const tempDir = await createTempFiles();
  try {
    const options = new Options({
      commands: ['move'],
      input: [tempDir],
      moveDeleteDirs: MoveDeleteDirsInverted[MoveDeleteDirs.AUTO].toLowerCase(),
    });

    // Files were moved, and they're no longer in the input directory
    const tempFilePaths = await FsPoly.walk(tempDir, WalkMode.FILES);
    const tempFiles = await Promise.all(
      tempFilePaths.map(async (filePath) => File.fileOf({ filePath })),
    );
    await Promise.all(tempFilePaths.map(async (filePath) => FsPoly.rm(filePath)));

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      tempFiles,
    );

    // The directories that had files moved out of them were deleted
    const deletedTempDirs = deletedDirs
      .map((dirPath) => dirPath.replace(tempDir + path.sep, ''))
      .toSorted();
    expect(deletedTempDirs).toContain('GB');
    expect(deletedTempDirs).toContain('NES');
  } finally {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
  }
});
