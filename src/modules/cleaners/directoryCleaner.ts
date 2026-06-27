import fs from 'node:fs';
import path from 'node:path';

import async from 'async';
import { isNotJunk } from 'junk';
import trash from 'trash';

import MappableSemaphore from '../../async/mappableSemaphore.js';
import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import Defaults from '../../globals/defaults.js';
import type File from '../../models/files/file.js';
import type Options from '../../models/options.js';
import ArrayUtil from '../../utils/arrayUtil.js';
import FsUtil from '../../utils/fsUtil.js';
import IntlUtil from '../../utils/intlUtil.js';
import Module from '../module.js';

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
    if (!this.options.shouldWrite()) {
      // We shouldn't cause any change to the output directory
      return [];
    }

    // If nothing was written, then don't clean anything
    if (filesToExclude.length === 0) {
      this.prefixedLogger.trace('no files were written, not cleaning output');
      return [];
    }

    this.prefixedLogger.trace('cleaning files in output');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    // If there is nothing to clean, then don't do anything
    const filesToClean = await this.options.scanOutputFilesWithoutCleanExclusions(
      dirsToClean,
      filesToExclude,
      (increment) => {
        this.progressBar.incrementTotal(increment);
      },
    );
    if (filesToClean.length === 0) {
      this.prefixedLogger.debug('no files to clean');
      return [];
    }

    this.progressBar.setSymbol(ProgressBarSymbol.RECYCLING);

    try {
      this.prefixedLogger.trace(
        `cleaning ${IntlUtil.toLocaleString(filesToClean.length)} file${filesToClean.length === 1 ? '' : 's'}`,
      );
      this.progressBar.resetProgress(filesToClean.length);
      if (this.options.getCleanDryRun()) {
        this.prefixedLogger.info(
          `paths skipped from cleaning (dry run):\n${filesToClean.map((filePath) => `  ${filePath}`).join('\n')}`,
        );
      } else {
        const cleanBackupDir = this.options.getCleanBackup();
        if (cleanBackupDir === undefined) {
          await this.trashOrDelete(filesToClean);
        } else {
          await this.backupFiles(cleanBackupDir, filesToClean);
        }
      }
    } catch (error) {
      this.prefixedLogger.error(`failed to clean unmatched files: ${error}`);
      return [];
    }

    try {
      let emptyDirs = await DirectoryCleaner.getEmptyDirs(dirsToClean);
      while (emptyDirs.length > 0) {
        this.progressBar.resetProgress(emptyDirs.length);
        this.prefixedLogger.trace(
          `cleaning ${IntlUtil.toLocaleString(emptyDirs.length)} empty director${emptyDirs.length === 1 ? 'y' : 'ies'}`,
        );
        if (this.options.getCleanDryRun()) {
          this.prefixedLogger.info(
            `paths skipped from cleaning (dry run):\n${emptyDirs.map((filePath) => `  ${filePath}`).join('\n')}`,
          );
        } else {
          await this.trashOrDelete(emptyDirs);
        }
        // Deleting some empty directories could leave others newly empty
        emptyDirs = await DirectoryCleaner.getEmptyDirs(dirsToClean);
      }
    } catch (error) {
      this.prefixedLogger.error(`failed to clean empty directories: ${error}`);
    }

    this.prefixedLogger.trace('done cleaning files in output');
    return filesToClean.toSorted((a, b) => a.localeCompare(b));
  }

  private async trashOrDelete(filePaths: string[]): Promise<void> {
    // Prefer recycling...
    for (let i = 0; i < filePaths.length; i += Defaults.OUTPUT_CLEANER_BATCH_SIZE) {
      const filePathsChunk = filePaths.slice(i, i + Defaults.OUTPUT_CLEANER_BATCH_SIZE);
      this.progressBar.setInProgress(filePathsChunk.length);
      this.prefixedLogger.info(
        `recycling cleaned path${filePathsChunk.length === 1 ? '' : 's'}:\n${filePathsChunk.map((filePath) => `  ${filePath}`).join('\n')}`,
      );
      try {
        await trash(filePathsChunk);
      } catch (error) {
        this.prefixedLogger.warn(
          `failed to recycle ${filePathsChunk.length} path${filePathsChunk.length === 1 ? '' : 's'}: ${error}`,
        );
      }
      this.progressBar.incrementCompleted(filePathsChunk.length);
    }

    // ...but if that doesn't work, delete the leftovers
    const existSemaphore = new MappableSemaphore(Defaults.OUTPUT_CLEANER_BATCH_SIZE);
    const existingFilePathsCheck = await existSemaphore.map(
      filePaths,
      async (filePath) => await FsUtil.exists(filePath),
    );
    const existingFilePaths = filePaths.filter(
      (_filePath, idx) => existingFilePathsCheck.at(idx) === true,
    );
    if (existingFilePaths.length > 0) {
      this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    }
    for (let i = 0; i < existingFilePaths.length; i += Defaults.OUTPUT_CLEANER_BATCH_SIZE) {
      const filePathsChunk = existingFilePaths.slice(i, i + Defaults.OUTPUT_CLEANER_BATCH_SIZE);
      this.prefixedLogger.info(
        `deleting cleaned path${filePathsChunk.length === 1 ? '' : 's'}:\n${filePathsChunk.map((filePath) => `  ${filePath}`).join('\n')}`,
      );
      await Promise.all(
        filePathsChunk.map(async (filePath) => {
          try {
            await FsUtil.rm(filePath, { force: true });
          } catch (error) {
            this.prefixedLogger.error(`${filePath}: failed to delete: ${error}`);
          }
        }),
      );
    }
  }

  private async backupFiles(backupDir: string, filePaths: string[]): Promise<void> {
    const semaphore = new MappableSemaphore(this.options.getWriterThreads());
    await semaphore.map(filePaths, async (filePath) => {
      this.progressBar.incrementInProgress();

      let backupPath = path.join(backupDir, path.basename(filePath));
      let increment = 0;
      while (await FsUtil.exists(backupPath)) {
        increment += 1;
        const { name, ext } = path.parse(filePath);
        backupPath = path.join(backupDir, `${name} (${increment})${ext}`);
      }

      this.prefixedLogger.info(`moving cleaned path: ${filePath} -> ${backupPath}`);
      const backupPathDir = path.dirname(backupPath);
      if (!(await FsUtil.exists(backupPathDir))) {
        await FsUtil.mkdir(backupPathDir, { recursive: true });
      }
      try {
        await FsUtil.mv(filePath, backupPath);
      } catch (error) {
        this.prefixedLogger.warn(`failed to move ${filePath} -> ${backupPath}: ${error}`);
      }
      this.progressBar.incrementCompleted();
    });
  }

  private static async getEmptyDirs(dirsToClean: string | string[]): Promise<string[]> {
    if (Array.isArray(dirsToClean)) {
      return (
        await async.mapLimit(
          dirsToClean,
          Defaults.MAX_FS_THREADS,
          async (dirToClean: string) => await this.getEmptyDirs(dirToClean),
        )
      )
        .flat()
        .reduce(ArrayUtil.reduceUnique(), []);
    }

    // Find all subdirectories and files in the directory
    if (!(await FsUtil.exists(dirsToClean))) {
      return [];
    }
    const subPaths = (await fs.promises.readdir(dirsToClean))
      .filter((basename) => isNotJunk(basename))
      .map((basename) => path.join(dirsToClean, basename));

    // Categorize the subdirectories and files
    const subDirs: string[] = [];
    const subFiles: string[] = [];
    await async.mapLimit(subPaths, Defaults.MAX_FS_THREADS, async (subPath: string) => {
      if (await FsUtil.isDirectory(subPath)) {
        subDirs.push(subPath);
      } else {
        subFiles.push(subPath);
      }
    });

    // If there are no subdirectories or files, this directory is empty
    if (subDirs.length === 0 && subFiles.length === 0) {
      return [dirsToClean];
    }

    // Otherwise, recurse and look for empty subdirectories
    return (
      await async.mapLimit(
        subDirs,
        Defaults.MAX_FS_THREADS,
        async (subDir: string) => await this.getEmptyDirs(subDir),
      )
    ).flat();
  }
}
