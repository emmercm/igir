import fg from 'fast-glob';
import { promises as fsPromises } from 'fs';
import { isNotJunk } from 'junk';
import path from 'path';
import trash from 'trash';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';

/**
 * Recycle any unknown files in the {@link OptionsProps.output} directory, if applicable.
 *
 * This class will not be run concurrently with any other class.
 */
export default class OutputCleaner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async clean(writtenFilesToExclude: File[]): Promise<number> {
    await this.progressBar.logInfo('Cleaning files in output');

    // If nothing was written, then don't clean anything
    if (!writtenFilesToExclude.length) {
      await this.progressBar.logInfo('No files were written, not cleaning output');
      return 0;
    }

    const outputDir = this.options.getOutput();
    const outputFilePathsToExclude = writtenFilesToExclude
      .map((file) => path.normalize(file.getFilePath()));

    // If there is nothing to clean, then don't do anything
    const filesToClean = (await fg(`${outputDir}/**`.replace(/\\/g, '/')))
      .map((file) => path.normalize(file))
      .filter((file) => outputFilePathsToExclude.indexOf(file) === -1);
    if (!filesToClean.length) {
      await this.progressBar.logInfo('No files to clean');
      return 0;
    }

    await this.progressBar.setSymbol(Symbols.RECYCLING);
    await this.progressBar.reset(filesToClean.length);

    try {
      await trash(filesToClean);
    } catch (e) {
      await this.progressBar.logError(`Failed to clean unmatched files in ${outputDir} : ${e}`);
    }

    try {
      const emptyDirs = await OutputCleaner.getEmptyDirs(outputDir);
      await trash(emptyDirs);
    } catch (e) {
      await this.progressBar.logError(`Failed to clean empty directories in ${outputDir} : ${e}`);
    }

    return filesToClean.length;
  }

  private static async getEmptyDirs(dirPath: string): Promise<string[]> {
    // Find all subdirectories and files in the directory
    const subPaths = (await fsPromises.readdir(dirPath))
      .filter((basename) => isNotJunk(basename))
      .map((basename) => path.join(dirPath, basename));

    // Categorize the subdirectories and files
    const subDirs: string[] = [];
    const subFiles: string[] = [];
    await Promise.all(subPaths.map(async (subPath) => {
      if ((await fsPromises.lstat(subPath)).isDirectory()) {
        subDirs.push(subPath);
      } else {
        subFiles.push(subPath);
      }
    }));

    // If there are no subdirectories or files, this directory is empty
    if (!subDirs.length && !subFiles.length) {
      return [dirPath];
    }

    // Otherwise, recurse and look for empty subdirectories
    const emptyDirs: string[] = [];
    await Promise.all(subDirs.map(async (subDir) => {
      emptyDirs.push(...await this.getEmptyDirs(subDir));
    }));
    return emptyDirs;
  }
}
