import fs from 'node:fs';
import path from 'node:path';

import { isNotJunk } from 'junk';
import trash from 'trash';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Recycle any unknown files in the {@link OptionsProps.output} directory, if applicable.
 *
 * This class will not be run concurrently with any other class.
 */
export default class DirectoryCleaner extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DirectoryCleaner.name);
    this.options = options;
  }

  /**
   * Clean some directories, excluding some files.
   */
  async clean(dirsToClean: string[], filesToExclude: File[]): Promise<string[]> {
    // If nothing was written, then don't clean anything
    if (filesToExclude.length === 0) {
      this.progressBar.logTrace('no files were written, not cleaning output');
      return [];
    }

    this.progressBar.logTrace('cleaning files in output');
    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(0);

    // If there is nothing to clean, then don't do anything
    const filesToClean = await this.options.scanOutputFilesWithoutCleanExclusions(
      dirsToClean,
      filesToExclude,
      async (increment) => {
        await this.progressBar.incrementTotal(increment);
      },
    );
    if (filesToClean.length === 0) {
      this.progressBar.logDebug('no files to clean');
      return [];
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.RECYCLING);

    try {
      this.progressBar.logTrace(`cleaning ${filesToClean.length.toLocaleString()} file${filesToClean.length !== 1 ? 's' : ''}`);
      await this.progressBar.reset(filesToClean.length);
      // TODO(cemmer): don't trash save files
      await this.trashOrDelete(filesToClean);
    } catch (error) {
      this.progressBar.logError(`failed to clean unmatched files: ${error}`);
      return [];
    }

    try {
      const emptyDirs = await DirectoryCleaner.getEmptyDirs(dirsToClean);
      await this.progressBar.reset(emptyDirs.length);
      this.progressBar.logTrace(`cleaning ${emptyDirs.length.toLocaleString()} empty director${emptyDirs.length !== 1 ? 'ies' : 'y'}`);
      await this.trashOrDelete(emptyDirs);
    } catch (error) {
      this.progressBar.logError(`failed to clean empty directories: ${error}`);
    }

    this.progressBar.logTrace('done cleaning files in output');
    return filesToClean.sort();
  }

  private async trashOrDelete(filePaths: string[]): Promise<void> {
    if (this.options.getCleanDryRun()) {
      this.progressBar.logInfo(`paths skipped from cleaning (dry run):\n${filePaths.map((filePath) => `  ${filePath}`).join('\n')}`);
      return;
    }

    // Prefer recycling...
    for (let i = 0; i < filePaths.length; i += Constants.OUTPUT_CLEANER_BATCH_SIZE) {
      const filePathsChunk = filePaths.slice(i, i + Constants.OUTPUT_CLEANER_BATCH_SIZE);
      this.progressBar.logInfo(`cleaning path${filePathsChunk.length !== 1 ? 's' : ''}:\n${filePathsChunk.map((filePath) => `  ${filePath}`).join('\n')}`);
      try {
        await trash(filePathsChunk);
      } catch (error) {
        this.progressBar.logWarn(`failed to recycle ${filePathsChunk.length} path${filePathsChunk.length !== 1 ? 's' : ''}: ${error}`);
      }
      await this.progressBar.update(i);
    }

    // ...but if that doesn't work, delete the leftovers
    const filePathsExist = await Promise.all(
      filePaths.map(async (filePath) => fsPoly.exists(filePath)),
    );
    await Promise.all(
      filePaths
        .filter((filePath, idx) => filePathsExist.at(idx))
        .map(async (filePath) => {
          try {
            await fsPoly.rm(filePath, { force: true });
          } catch (error) {
            this.progressBar.logError(`failed to delete ${filePath}: ${error}`);
          }
        }),
    );
  }

  private static async getEmptyDirs(dirsToClean: string | string[]): Promise<string[]> {
    if (Array.isArray(dirsToClean)) {
      return (await Promise.all(
        dirsToClean.map(async (dirToClean) => DirectoryCleaner.getEmptyDirs(dirToClean)),
      ))
        .flat()
        .reduce(ArrayPoly.reduceUnique(), []);
    }

    // Find all subdirectories and files in the directory
    const subPaths = (await fs.promises.readdir(dirsToClean))
      .filter((basename) => isNotJunk(basename))
      .map((basename) => path.join(dirsToClean, basename));

    // Categorize the subdirectories and files
    const subDirs: string[] = [];
    const subFiles: string[] = [];
    await Promise.all(subPaths.map(async (subPath) => {
      if (await fsPoly.isDirectory(subPath)) {
        subDirs.push(subPath);
      } else {
        subFiles.push(subPath);
      }
    }));

    // If there are no subdirectories or files, this directory is empty
    if (subDirs.length === 0 && subFiles.length === 0) {
      return [dirsToClean];
    }

    // Otherwise, recurse and look for empty subdirectories
    return (await Promise.all(
      subDirs.map(async (subDir) => this.getEmptyDirs(subDir)),
    )).flat();
  }
}
