import ProgressBar from '../console/progressBar.js';
import Defaults from '../constants/defaults.js';
import DriveSemaphore from '../driveSemaphore.js';
import ElasticSemaphore from '../elasticSemaphore.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
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
    Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

  protected readonly options: Options;

  protected constructor(options: Options, progressBar: ProgressBar, loggerPrefix: string) {
    super(progressBar, loggerPrefix);
    this.options = options;
  }

  protected async getFilesFromPaths(
    filePaths: string[],
    threads: number,
    checksumBitmask: number,
  ): Promise<File[]> {
    return (await new DriveSemaphore(threads).map(
      filePaths,
      async (inputFile) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${inputFile} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        const files = await this.getFilesFromPath(inputFile, checksumBitmask);

        this.progressBar.removeWaitingMessage(waitingMessage);
        await this.progressBar.incrementDone();
        return files;
      },
    )).flat();
  }

  protected async getUniqueFilesFromPaths(
    filePaths: string[],
    threads: number,
    checksumBitmask: number,
  ): Promise<File[]> {
    const foundFiles = await this.getFilesFromPaths(filePaths, threads, checksumBitmask);
    return foundFiles
      .filter(ArrayPoly.filterUniqueMapped((file) => file.hashCode()));
  }

  private async getFilesFromPath(
    filePath: string,
    checksumBitmask: number,
  ): Promise<File[]> {
    try {
      const totalKilobytes = await fsPoly.size(filePath) / 1024;
      const files = await Scanner.FILESIZE_SEMAPHORE.runExclusive(
        async () => {
          if (await fsPoly.isSymlink(filePath)) {
            const realFilePath = await fsPoly.readlinkResolved(filePath);
            if (!await fsPoly.exists(realFilePath)) {
              this.progressBar.logWarn(`${filePath}: broken symlink, '${realFilePath}' doesn't exist`);
              return [];
            }
          }
          return FileFactory.filesFrom(filePath, checksumBitmask);
        },
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
