import async, { AsyncResultCallback } from 'async';
import path from 'path';

import ProgressBar from '../console/progressBar.js';
import ArchiveFactory from '../types/archives/archiveFactory.js';
import Rar from '../types/archives/rar.js';
import SevenZip from '../types/archives/sevenZip.js';
import Tar from '../types/archives/tar.js';
import Zip from '../types/archives/zip.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';

export default abstract class Scanner {
  protected readonly options: Options;

  protected readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  protected async getFilesFromPaths(filePaths: string[], threads: number): Promise<File[]> {
    return (await async.mapLimit(
      filePaths,
      threads,
      async (inputFile, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.increment();
        const files = await this.getFilesFromPath(inputFile);
        callback(null, files);
      },
    ))
      .flatMap((files) => files)
      // Limit to unique files
      .sort(this.fileComparator.bind(this))
      .filter((one, oneIdx, files) => files.findIndex((two) => {
        const oneHashCodes = one.hashCodes();
        const twoHashCodes = two.hashCodes();
        return twoHashCodes.every((hashCode, hashIdx) => hashCode === oneHashCodes[hashIdx]);
      }) === oneIdx);
  }

  private async getFilesFromPath(filePath: string): Promise<File[]> {
    let files: File[];
    if (ArchiveFactory.isArchive(filePath)) {
      try {
        files = await ArchiveFactory.archiveFrom(filePath).getArchiveEntries();
        if (!files.length) {
          await this.progressBar.logWarn(`Found no files in archive: ${filePath}`);
        }
      } catch (e) {
        await this.progressBar.logError(`Failed to parse archive ${filePath} : ${e}`);
        files = [];
      }
    } else {
      files = [await File.fileOf(filePath)];
    }
    return files;
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
   * This ordering should match {@link ArchiveFactory#archiveFrom}
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
