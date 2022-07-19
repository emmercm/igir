import fg from 'fast-glob';
import { isNotJunk } from 'junk';
import fsPromises from 'node:fs/promises';
import path from 'path';
import trash from 'trash';

import Logger from '../logger.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ROMFile from '../types/romFile.js';

export default class OutputCleaner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async clean(writtenRoms: ROMFile[]) {
    // If nothing was written, then don't clean anything
    const outputRomPaths = writtenRoms
      .map((romFile) => romFile.getFilePath());
    if (!outputRomPaths.length) {
      return;
    }

    const outputDir = this.options.getOutput();

    // If there is nothing to clean, then don't do anything
    const filesToClean = (await fg(`${outputDir}/**`))
      .filter((file) => outputRomPaths.indexOf(file) === -1);
    if (!filesToClean) {
      return;
    }

    this.progressBar.reset(filesToClean.length).setSymbol('♻️');

    try {
      await trash(filesToClean);
    } catch (e) {
      Logger.error(`Failed to clean unmatched files in ${outputDir} : ${e}`);
    }

    try {
      const emptyDirs = await OutputCleaner.getEmptyDirs(outputDir);
      await trash(emptyDirs);
    } catch (e) {
      Logger.error(`Failed to clean empty directories in ${outputDir} : ${e}`);
    }

    this.progressBar
      .done()
      .setSymbol('✅')
      .setProgressMessage(`${filesToClean.length} file${filesToClean.length !== 1 ? 's' : ''} recycled`);
  }

  private static async getEmptyDirs(dirPath: string): Promise<string[]> {
    // Find all subdirectories and files in the directory
    const subPaths = (await fsPromises.readdir(dirPath))
      .filter((subPath) => isNotJunk(subPath))
      .map((subPath) => path.join(dirPath, subPath));

    // Categories the subdirectories and files
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
