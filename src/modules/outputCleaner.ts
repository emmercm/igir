import fs from 'fs';
import { isNotJunk } from 'junk';
import path from 'path';
import trash from 'trash';
import util from 'util';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Recycle any unknown files in the {@link OptionsProps.output} directory, if applicable.
 *
 * This class will not be run concurrently with any other class.
 */
export default class OutputCleaner extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, OutputCleaner.name);
    this.options = options;
  }

  async clean(dirsToClean: string[], writtenFilesToExclude: File[]): Promise<number> {
    await this.progressBar.logInfo('Cleaning files in output');

    // If nothing was written, then don't clean anything
    if (!writtenFilesToExclude.length) {
      await this.progressBar.logDebug('No files were written, not cleaning output');
      return 0;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(dirsToClean.length);

    // If there is nothing to clean, then don't do anything
    const filesToClean = await this.options.scanOutputFilesWithoutCleanExclusions(
      dirsToClean,
      writtenFilesToExclude,
    );
    if (!filesToClean.length) {
      await this.progressBar.logDebug('No files to clean');
      return 0;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.RECYCLING);

    try {
      await this.progressBar.logDebug(`Cleaning ${filesToClean.length.toLocaleString()} file${filesToClean.length !== 1 ? 's' : ''}`);
      await this.progressBar.reset(filesToClean.length);
      // TODO(cemmer): don't trash save files
      await this.trashOrDelete(filesToClean);
    } catch (e) {
      await this.progressBar.logError(`Failed to clean unmatched files : ${e}`);
    }

    try {
      const emptyDirs = await OutputCleaner.getEmptyDirs(dirsToClean);
      await this.progressBar.reset(emptyDirs.length);
      await this.progressBar.logDebug(`Cleaning ${emptyDirs.length.toLocaleString()} empty director${emptyDirs.length !== 1 ? 'ies' : 'y'}`);
      await this.trashOrDelete(emptyDirs);
    } catch (e) {
      await this.progressBar.logError(`Failed to clean empty directories : ${e}`);
    }

    await this.progressBar.logInfo('Done cleaning files in output');
    return filesToClean.length;
  }

  private async trashOrDelete(filePaths: string[]): Promise<void> {
    // Prefer recycling...
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < filePaths.length; i += Constants.OUTPUT_CLEANER_BATCH_SIZE) {
      await trash(filePaths.slice(i, i + Constants.OUTPUT_CLEANER_BATCH_SIZE));
      await this.progressBar.update(i);
    }

    // ...but if that doesn't work, delete the leftovers
    await Promise.all(filePaths.map(async (filePath) => {
      if (await fsPoly.exists(filePath)) {
        await fsPoly.rm(filePath);
      }
    }));
  }

  private static async getEmptyDirs(dirsToClean: string | string[]): Promise<string[]> {
    if (Array.isArray(dirsToClean)) {
      return (await Promise.all(
        dirsToClean.map(async (dirToClean) => OutputCleaner.getEmptyDirs(dirToClean)),
      ))
        .flatMap((emptyDirs) => emptyDirs)
        .filter((emptyDir, idx, emptyDirs) => emptyDirs.indexOf(emptyDir) === idx);
    }

    // Find all subdirectories and files in the directory
    const subPaths = (await util.promisify(fs.readdir)(dirsToClean))
      .filter((basename) => isNotJunk(basename))
      .map((basename) => path.join(dirsToClean, basename));

    // Categorize the subdirectories and files
    const subDirs: string[] = [];
    const subFiles: string[] = [];
    await Promise.all(subPaths.map(async (subPath) => {
      if ((await util.promisify(fs.lstat)(subPath)).isDirectory()) {
        subDirs.push(subPath);
      } else {
        subFiles.push(subPath);
      }
    }));

    // If there are no subdirectories or files, this directory is empty
    if (!subDirs.length && !subFiles.length) {
      return [dirsToClean];
    }

    // Otherwise, recurse and look for empty subdirectories
    const emptyDirs: string[] = [];
    await Promise.all(subDirs.map(async (subDir) => {
      emptyDirs.push(...await this.getEmptyDirs(subDir));
    }));
    return emptyDirs;
  }
}
