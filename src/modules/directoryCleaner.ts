import fs from 'node:fs';
import path from 'node:path';

import { Semaphore } from 'async-mutex';
import { isNotJunk } from 'junk';
import trash from 'trash';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Defaults from '../globals/defaults.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Recycle any unknown files in the {@link OptionsProps.output} directory, if applicable.
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
      if (this.options.getCleanDryRun()) {
        this.progressBar.logInfo(`paths skipped from cleaning (dry run):\n${filesToClean.map((filePath) => `  ${filePath}`).join('\n')}`);
      } else {
        const cleanBackupDir = this.options.getCleanBackup();
        if (cleanBackupDir !== undefined) {
          await this.backupFiles(cleanBackupDir, filesToClean);
        } else {
          await this.trashOrDelete(filesToClean);
        }
      }
    } catch (error) {
      this.progressBar.logError(`failed to clean unmatched files: ${error}`);
      return [];
    }

    try {
      let emptyDirs = await DirectoryCleaner.getEmptyDirs(dirsToClean);
      while (emptyDirs.length > 0) {
        await this.progressBar.reset(emptyDirs.length);
        this.progressBar.logTrace(`cleaning ${emptyDirs.length.toLocaleString()} empty director${emptyDirs.length !== 1 ? 'ies' : 'y'}`);
        if (this.options.getCleanDryRun()) {
          this.progressBar.logInfo(`paths skipped from cleaning (dry run):\n${emptyDirs.map((filePath) => `  ${filePath}`).join('\n')}`);
        } else {
          await this.trashOrDelete(emptyDirs);
        }
        // Deleting some empty directories could leave others newly empty
        emptyDirs = await DirectoryCleaner.getEmptyDirs(dirsToClean);
      }
    } catch (error) {
      this.progressBar.logError(`failed to clean empty directories: ${error}`);
    }

    this.progressBar.logTrace('done cleaning files in output');
    return filesToClean.sort();
  }

  private async trashOrDelete(filePaths: string[]): Promise<void> {
    // Prefer recycling...
    for (let i = 0; i < filePaths.length; i += Defaults.OUTPUT_CLEANER_BATCH_SIZE) {
      const filePathsChunk = filePaths.slice(i, i + Defaults.OUTPUT_CLEANER_BATCH_SIZE);
      this.progressBar.logInfo(`recycling cleaned path${filePathsChunk.length !== 1 ? 's' : ''}:\n${filePathsChunk.map((filePath) => `  ${filePath}`).join('\n')}`);
      try {
        await trash(filePathsChunk);
      } catch (error) {
        this.progressBar.logWarn(`failed to recycle ${filePathsChunk.length} path${filePathsChunk.length !== 1 ? 's' : ''}: ${error}`);
      }
      await this.progressBar.update(i);
    }

    // ...but if that doesn't work, delete the leftovers
    const existSemaphore = new Semaphore(Defaults.OUTPUT_CLEANER_BATCH_SIZE);
    const existingFilePathsCheck = await Promise.all(filePaths
      .map(async (filePath) => existSemaphore.runExclusive(async () => fsPoly.exists(filePath))));
    const existingFilePaths = filePaths.filter((filePath, idx) => existingFilePathsCheck.at(idx));
    for (let i = 0; i < existingFilePaths.length; i += Defaults.OUTPUT_CLEANER_BATCH_SIZE) {
      const filePathsChunk = existingFilePaths.slice(i, i + Defaults.OUTPUT_CLEANER_BATCH_SIZE);
      this.progressBar.logInfo(`deleting cleaned path${filePathsChunk.length !== 1 ? 's' : ''}:\n${filePathsChunk.map((filePath) => `  ${filePath}`).join('\n')}`);
      try {
        await Promise.all(filePathsChunk
          .map(async (filePath) => fsPoly.rm(filePath, { force: true })));
      } catch (error) {
        this.progressBar.logWarn(`failed to delete ${filePathsChunk.length} path${filePathsChunk.length !== 1 ? 's' : ''}: ${error}`);
      }
    }
  }

  private async backupFiles(backupDir: string, filePaths: string[]): Promise<void> {
    const semaphore = new Semaphore(this.options.getWriterThreads());
    await Promise.all(filePaths.map(async (filePath) => {
      await semaphore.runExclusive(async () => {
        let backupPath = path.join(backupDir, path.basename(filePath));
        let increment = 0;
        while (await fsPoly.exists(backupPath)) {
          increment += 1;
          const { name, ext } = path.parse(filePath);
          backupPath = path.join(backupDir, `${name} (${increment})${ext}`);
        }

        this.progressBar.logInfo(`moving cleaned path: ${filePath} -> ${backupPath}`);
        const backupPathDir = path.dirname(backupPath);
        if (!await fsPoly.exists(backupPathDir)) {
          await fsPoly.mkdir(backupPathDir, { recursive: true });
        }
        try {
          await fsPoly.mv(filePath, backupPath);
        } catch (error) {
          this.progressBar.logWarn(`failed to move ${filePath} -> ${backupPath}: ${error}`);
        }
        await this.progressBar.incrementProgress();
      });
    }));
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
