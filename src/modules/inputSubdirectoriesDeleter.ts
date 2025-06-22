import path from 'node:path';

import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Defaults from '../globals/defaults.js';
import FsPoly, { WalkMode } from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options, { MoveDeleteDirs } from '../types/options.js';
import Module from './module.js';

/**
 * After all output {@link File}s have been written, delete any empty subdirectories that had
 * {@link File}s moved out of them. This needs to happen after all writing has finished to guarantee
 * that we're done reading input {@link File}s from disk.
 */
export default class InputSubdirectoriesDeleter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, InputSubdirectoriesDeleter.name);
    this.options = options;
  }

  /**
   * Delete empty input subdirectories that had {@link File}s moved out of them.
   */
  async delete(movedRoms: File[]): Promise<string[]> {
    if (!this.options.shouldMove()) {
      // We shouldn't do anything
      return [];
    }

    if (this.options.getMoveDeleteDirs() === MoveDeleteDirs.NEVER) {
      // We shouldn't do anything
      return [];
    }

    if (movedRoms.length === 0 && this.options.getMoveDeleteDirs() !== MoveDeleteDirs.ALWAYS) {
      // We shouldn't do anything
      return [];
    }

    this.progressBar.logTrace('deleting empty input subdirectories');
    this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    this.progressBar.resetProgress(0);

    let dirsToMaybeDelete: Set<string>;
    if (this.options.getMoveDeleteDirs() === MoveDeleteDirs.ALWAYS) {
      // Consider every subdirectory in the input directories
      dirsToMaybeDelete = new Set(await this.options.scanInputSubdirectories());
    } else {
      // Only consider subdirectories that had files moved out of them
      dirsToMaybeDelete = new Set(
        movedRoms.map((movedRom) => path.dirname(movedRom.getFilePath())),
      );
    }

    const inputPathsNormalized = new Set(
      this.options.getInputPaths().map((inputPath) => path.normalize(inputPath)),
    );
    const deletedDirs = await this.walkAndDelete([...dirsToMaybeDelete], [...inputPathsNormalized]);

    this.progressBar.logTrace('done deleting empty input subdirectories');
    return deletedDirs;
  }

  private async walkAndDelete(
    dirPaths: string[],
    inputPathsNormalized: string[],
  ): Promise<string[]> {
    const deletedDirs = await async.filterLimit(
      dirPaths,
      Defaults.MAX_FS_THREADS,
      async (dirPath: string) => {
        try {
          if ((await FsPoly.walk(dirPath, WalkMode.FILES)).length === 0) {
            this.progressBar.incrementTotal(1);
            this.progressBar.incrementInProgress(1);
            await FsPoly.rm(dirPath, { recursive: true, force: true });
            return true;
          }
        } catch {
          /* ignored */
        }
        return false;
      },
    );

    const parentDirs = new Set(
      deletedDirs
        .map((emptyDir) => path.dirname(emptyDir))
        .filter((parentDir) => {
          const parentDirNormalized = path.normalize(parentDir);
          return inputPathsNormalized.some(
            (inputPath) =>
              parentDirNormalized.startsWith(inputPath) && parentDirNormalized !== inputPath,
          );
        }),
    );
    if (parentDirs.size === 0) {
      return deletedDirs;
    }

    const deletedParentDirs = await this.walkAndDelete([...parentDirs], inputPathsNormalized);
    return [...deletedDirs, ...deletedParentDirs];
  }
}
