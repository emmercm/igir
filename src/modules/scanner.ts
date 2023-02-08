import async, { AsyncResultCallback } from 'async';
import path from 'path';

import ProgressBar from '../console/progressBar.js';
import Constants from '../constants.js';
import ElasticSemaphore from '../elasticSemaphore.js';
import fsPoly from '../polyfill/fsPoly.js';
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
  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private static readonly FILESIZE_SEMAPHORE = new ElasticSemaphore(
    Constants.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

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
        const files = await this.getFilesFromPath(inputFile);

        await this.progressBar.increment();
        callback(null, files);
      },
    ))
      .flatMap((files) => files);
    if (!filterUnique) {
      return foundFiles;
    }

    // Limit to unique files
    // NOTE(cemmer): this should happen before parsing ROM headers, so this uniqueness will be based
    //  on the full file contents. We will later care about how to choose ROMs based on their
    //  header or lack thereof.
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
      const totalKilobytes = await fsPoly.size(filePath) / 1024;
      const files = await Scanner.FILESIZE_SEMAPHORE.runExclusive(
        async () => FileFactory.filesFrom(filePath),
        totalKilobytes,
      );

      if (!files.length) {
        await this.progressBar.logWarn(`${filePath}: Found no files in path`);
      }
      return files;
    } catch (e) {
      await this.progressBar.logError(`${filePath}: Failed to parse file : ${e}`);
      return [];
    }
  }

  private fileComparator(one: File, two: File): number {
    // Prefer files that are already in the output directory
    const output = path.resolve(this.options.getOutputDirRoot());
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
