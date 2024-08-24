import { CHDInfo, CHDType } from 'chdman';

import ProgressBar from '../console/progressBar.js';
import DriveSemaphore from '../driveSemaphore.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Chd from '../types/files/archives/chd/chd.js';
import Gzip from '../types/files/archives/sevenZip/gzip.js';
import Tar from '../types/files/archives/tar.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * The base class for every input file scanner class.
 */
export default abstract class Scanner extends Module {
  protected readonly options: Options;

  private readonly fileFactory: FileFactory;

  protected constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    loggerPrefix: string,
  ) {
    super(progressBar, loggerPrefix);
    this.options = options;
    this.fileFactory = fileFactory;
  }

  protected async getFilesFromPaths(
    filePaths: string[],
    threads: number,
    checksumBitmask: number,
    checksumArchives = false,
  ): Promise<File[]> {
    return (await new DriveSemaphore(threads).map(
      filePaths,
      async (inputFile) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${inputFile} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        const files = await this.getFilesFromPath(inputFile, checksumBitmask, checksumArchives);
        await this.logWarnings(files);

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
    checksumArchives = false,
  ): Promise<File[]> {
    try {
      if (await fsPoly.isSymlink(filePath)) {
        const realFilePath = await fsPoly.readlinkResolved(filePath);
        if (!await fsPoly.exists(realFilePath)) {
          this.progressBar.logWarn(`${filePath}: broken symlink, '${realFilePath}' doesn't exist`);
          return [];
        }
      }

      const filesFromPath = await this.fileFactory.filesFrom(
        filePath,
        checksumBitmask,
        this.options.getInputChecksumQuick() ? ChecksumBitmask.NONE : checksumBitmask,
      );

      const fileIsArchive = filesFromPath.some((file) => file instanceof ArchiveEntry);
      if (checksumArchives && fileIsArchive) {
        filesFromPath.push(await this.fileFactory.fileFrom(filePath, checksumBitmask));
      }

      if (filesFromPath.length === 0) {
        this.progressBar.logWarn(`${filePath}: found no files in path`);
      }
      return filesFromPath;
    } catch (error) {
      this.progressBar.logError(`${filePath}: failed to parse file: ${error}`);
      return [];
    }
  }

  private async logWarnings(files: File[]): Promise<void> {
    if (this.options.getInputChecksumQuick()) {
      const archiveWithoutChecksums = files
        .filter((file) => file instanceof ArchiveEntry)
        .map((archiveEntry) => archiveEntry.getArchive())
        .find((archive) => archive instanceof Gzip || Tar);
      if (archiveWithoutChecksums !== undefined) {
        this.progressBar.logWarn(`${archiveWithoutChecksums.getFilePath()}: quick checksums will skip ${archiveWithoutChecksums.getExtension()} files`);
        return;
      }

      const chdInfos = await Promise.all(files
        .filter((file) => file instanceof ArchiveEntry)
        .map((archiveEntry) => archiveEntry.getArchive())
        .filter((archive) => archive instanceof Chd)
        .map(async (chd) => ([chd, await chd.getInfo()] satisfies [Chd, CHDInfo])));

      const cdRom = chdInfos.find(([, info]) => info.type === CHDType.CD_ROM);
      if (cdRom !== undefined) {
        this.progressBar.logWarn(`${cdRom[0].getFilePath()}: quick checksums will skip .cue/.bin files in CD-ROM CHDs`);
        return;
      }

      const gdRom = chdInfos.find(([, info]) => info.type === CHDType.GD_ROM);
      if (gdRom !== undefined) {
        this.progressBar.logWarn(`${gdRom[0].getFilePath()}: quick checksums will skip .gdi/.bin/.raw files in GD-ROM CHDs`);
      }
    }
  }
}
