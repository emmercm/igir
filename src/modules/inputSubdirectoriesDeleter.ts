import fs from 'node:fs';
import path from 'node:path';

import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Defaults from '../globals/defaults.js';
import FsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
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

    if (movedRoms.length === 0) {
      return [];
    }

    this.progressBar.logTrace('deleting empty input subdirectories');
    this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    this.progressBar.reset(0);

    const movedDirs = new Set(
      movedRoms.map((movedRom) => path.dirname(path.resolve(movedRom.getFilePath()))),
    );
    const inputPathsNormalized = new Set(
      this.options.getInputPaths().map((inputPath) => path.normalize(inputPath)),
    );
    const deletedDirs = await this.walkAndDelete([...movedDirs], [...inputPathsNormalized]);

    this.progressBar.logTrace('done deleting empty input subdirectories');
    return deletedDirs;
  }

  private async walkAndDelete(
    dirPaths: string[],
    inputPathsNormalized: string[],
  ): Promise<string[]> {
    const deletedDirs: string[] = [];

    const emptyDirs = await async.filterLimit(
      dirPaths,
      Defaults.MAX_FS_THREADS,
      async (dirPath: string) => {
        try {
          if (await this.isEmptyDir(dirPath)) {
            this.progressBar.incrementTotal(1);
            this.progressBar.incrementProgress();
            await FsPoly.rm(dirPath, { recursive: true, force: true });
            deletedDirs.push(dirPath);
            return true;
          }
        } catch {
          /* ignored */
        }
        return false;
      },
    );

    const parentDirs = new Set(
      emptyDirs
        .map((emptyDir) => path.dirname(emptyDir))
        .filter((parentDir) => {
          const parentDirNormalized = path.normalize(parentDir);
          return inputPathsNormalized.some((inputPath) =>
            parentDirNormalized.startsWith(inputPath),
          );
        }),
    );
    if (parentDirs.size === 0) {
      return deletedDirs;
    }

    const deletedParentDirs = await this.walkAndDelete([...parentDirs], inputPathsNormalized);
    return [...deletedDirs, ...deletedParentDirs];
  }

  private async isEmptyDir(dirPath: string): Promise<boolean> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isFile() || (entry.isSymbolicLink() && (await FsPoly.isFile(entryPath)))) {
        // This directory contains a file, it is not empty
        return false;
      }
      if (
        (entry.isDirectory() ||
          (entry.isSymbolicLink() && (await FsPoly.isDirectory(entryPath)))) &&
        !(await this.isEmptyDir(entryPath))
      ) {
        // If any subdirectory is not empty, then this directory is not empty
        return false;
      }
    }
    return true;
  }
}
