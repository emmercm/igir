import async, { AsyncResultCallback } from 'async';
import path from 'path';

import ProgressBar from '../console/progressBar.js';
import FileFactory from '../types/archives/fileFactory.js';
import Rar from '../types/archives/rar.js';
import SevenZip from '../types/archives/sevenZip.js';
import Tar from '../types/archives/tar.js';
import Zip from '../types/archives/zip.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

export default abstract class Scanner extends Module {
  protected readonly options: Options;

  protected constructor(options: Options, progressBar: ProgressBar, loggerPrefix: string) {
    super(progressBar, loggerPrefix);
    this.options = options;
  }

  protected async getFilesFromPaths(
    filePaths: string[],
    threads: number,
    filterUnique = true,
  ): Promise<File[]> {
    const foundFiles = (await async.mapLimit(
      filePaths,
      threads,
      async (inputFile, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.increment();
        const files = await this.getFilesFromPath(inputFile);
        callback(null, files);
      },
    ))
      .flatMap((files) => files);
    if (!filterUnique) {
      return foundFiles;
    }

    // Limit to unique files
    return [...foundFiles
      .sort(this.fileComparator.bind(this))
      .reduce((map, file) => {
        const hashCodes = file.hashCodes().join(',');
        if (!map.has(hashCodes)) {
          map.set(hashCodes, file);
        }
        return map;
      }, new Map<string, File>()).values()];
  }

  private async getFilesFromPath(filePath: string): Promise<File[]> {
    try {
      const files = await FileFactory.filesFrom(filePath);
      if (!files.length) {
        await this.progressBar.logWarn(`Found no files in path: ${filePath}`);
      }
      return files;
    } catch (e) {
      await this.progressBar.logError(`Failed to parse file ${filePath} : ${e}`);
      return [];
    }
  }

  private fileComparator(one: File, two: File): number {
    // Prefer files that are already in the output directory
    const output = path.resolve(this.options.getOutput());
    const outputSort = (path.resolve(one.getFilePath()).startsWith(output) ? 0 : 1)
      - (path.resolve(two.getFilePath()).startsWith(output) ? 0 : 1);
    if (outputSort !== 0) {
      return outputSort;
    }

    // Otherwise, prefer non-archives or more efficient archives
    const archiveEntrySort = Scanner.archiveEntryPriority(one)
      - Scanner.archiveEntryPriority(two);
    if (archiveEntrySort !== 0) {
      return archiveEntrySort;
    }

    // Otherwise, we don't particularly care
    return one.getFilePath().localeCompare(two.getFilePath());
  }

  /**
   * This ordering should match {@link FileFactory#archiveFrom}
   */
  private static archiveEntryPriority(file: File): number {
    if (!(file instanceof ArchiveEntry)) {
      return 0;
    } if (file.getArchive() instanceof Zip) {
      return 1;
    } if (file.getArchive() instanceof Tar) {
      return 2;
    } if (file.getArchive() instanceof Rar) {
      return 3;
    } if (file.getArchive() instanceof SevenZip) {
      return 4;
    }
    return 99;
  }
}
