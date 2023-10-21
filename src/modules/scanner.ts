import async, { AsyncResultCallback } from 'async';

import ProgressBar from '../console/progressBar.js';
import Constants from '../constants.js';
import ElasticSemaphore from '../elasticSemaphore.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * The base class for every input file scanner class.
 */
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
        await this.progressBar.incrementProgress();
        const waitingMessage = `${inputFile} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        const files = await this.getFilesFromPath(inputFile);

        this.progressBar.removeWaitingMessage(waitingMessage);
        await this.progressBar.incrementDone();
        callback(undefined, files);
      },
    ))
      .flat();
    if (!filterUnique) {
      return foundFiles;
    }

    // Limit to unique files
    return [...foundFiles
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

      if (files.length === 0) {
        this.progressBar.logWarn(`${filePath}: found no files in path`);
      }
      return files;
    } catch (error) {
      this.progressBar.logError(`${filePath}: failed to parse file: ${error}`);
      return [];
    }
  }
}
