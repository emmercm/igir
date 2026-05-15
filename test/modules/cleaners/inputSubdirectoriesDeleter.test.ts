import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import File from '../../../src/models/files/file.js';
import Options, { MoveDeleteDirs, MoveDeleteDirsInverted } from '../../../src/models/options.js';
import InputSubdirectoriesDeleter from '../../../src/modules/cleaners/inputSubdirectoriesDeleter.js';
import FsUtil, { WalkMode } from '../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function createTempFiles(): Promise<string> {
  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    await FsUtil.mkdir(path.join(tempDir, 'GB', 'EUR'), { recursive: true });
    await FsUtil.touch(
      path.join(tempDir, 'GB', 'JPN', 'Gojira-kun - Kaijuu Daikoushin (Japan).gb'),
    );
    await FsUtil.touch(
      path.join(tempDir, 'GB', 'USA', 'Contra - The Alien Wars (USA) (SGB Enhanced).gb'),
    );
    await FsUtil.touch(path.join(tempDir, 'GB', 'USA', 'Shaq Fu (USA) (SGB Enhanced).gb'));

    await FsUtil.touch(path.join(tempDir, 'NES', 'EUR', 'Double Dragon (Europe).nes'));
    await FsUtil.mkdir(path.join(tempDir, 'NES', 'JPN'), { recursive: true });
    await FsUtil.touch(path.join(tempDir, 'NES', 'USA', 'Dragon Warrior (USA) (Rev 1).nes'));
    await FsUtil.touch(path.join(tempDir, 'NES', 'USA', 'Rainbow Islands (USA).nes'));
  } catch (error) {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
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
    await FsUtil.rm(tempDir, { recursive: true, force: true });
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
    const tempFilePaths = await FsUtil.walk(tempDir, WalkMode.FILES);
    const tempFiles = await Promise.all(
      tempFilePaths.map(async (filePath) => await File.fileOf({ filePath })),
    );
    await Promise.all(
      tempFilePaths.map(async (filePath) => {
        await FsUtil.rm(filePath);
      }),
    );

    const deletedDirs = await new InputSubdirectoriesDeleter(options, new ProgressBarFake()).delete(
      tempFiles,
    );

    // No directories were deleted
    expect(deletedDirs).toHaveLength(0);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
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
    await FsUtil.rm(tempDir, { recursive: true, force: true });
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
    await FsUtil.rm(tempDir, {
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
    const tempFilePaths = await FsUtil.walk(tempDir, WalkMode.FILES);
    const tempFiles = await Promise.all(
      tempFilePaths.map(async (filePath) => await File.fileOf({ filePath })),
    );
    await Promise.all(
      tempFilePaths.map(async (filePath) => {
        await FsUtil.rm(filePath);
      }),
    );

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
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});
