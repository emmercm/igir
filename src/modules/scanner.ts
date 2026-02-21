import type { CHDInfo } from 'chdman';
import { CHDType } from 'chdman';

import type DriveSemaphore from '../async/driveSemaphore.js';
import type ProgressBar from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Chd from '../types/files/archives/chd/chd.js';
import Gzip from '../types/files/archives/sevenZip/gzip.js';
import Tar from '../types/files/archives/tar.js';
import type File from '../types/files/file.js';
import type { ChecksumBitmaskValue } from '../types/files/fileChecksums.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import type FileFactory from '../types/files/fileFactory.js';
import type Options from '../types/options.js';
import Module from './module.js';

/**
 * The base class for every input file scanner class.
 */
export default abstract class Scanner extends Module {
  protected readonly options: Options;
  protected readonly driveSemaphore: DriveSemaphore;

  private readonly fileFactory: FileFactory;

  protected constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    driveSemaphore: DriveSemaphore,
    loggerPrefix: string,
  ) {
    super(progressBar, loggerPrefix);
    this.options = options;
    this.driveSemaphore = driveSemaphore;
    this.fileFactory = fileFactory;
  }

  protected async getFilesFromPaths(
    filePaths: string[],
    checksumBitmask: number,
    checksumArchives = false,
  ): Promise<File[]> {
    return (
      await this.driveSemaphore.map(filePaths, async (inputFile) => {
        this.progressBar.incrementInProgress();
        // TODO: why does this never show?
        const childBar = this.progressBar.addChildBar({
          name: inputFile,
        });

        let files: File[];
        try {
          files = await this.getFilesFromPath(inputFile, checksumBitmask, checksumArchives);
          await this.logWarnings(files);
        } finally {
          childBar.delete();
        }

        this.progressBar.incrementCompleted();
        return files;
      })
    ).flat();
  }

  protected async getUniqueFilesFromPaths(
    filePaths: string[],
    checksumBitmask: ChecksumBitmaskValue,
  ): Promise<File[]> {
    if (checksumBitmask === ChecksumBitmask.NONE) {
      throw new Error('must provide ChecksumBitmask when getting unique files');
    }
    const foundFiles = await this.getFilesFromPaths(filePaths, checksumBitmask);
    return foundFiles.filter(ArrayPoly.filterUniqueMapped((file) => file.hashCode()));
  }

  private async getFilesFromPath(
    filePath: string,
    checksumBitmask: number,
    checksumArchives = false,
  ): Promise<File[]> {
    try {
      if (await FsPoly.isSymlink(filePath)) {
        const realFilePath = await FsPoly.readlinkResolved(filePath);
        if (!(await FsPoly.exists(realFilePath))) {
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
        if (this.options.getInputChecksumQuick()) {
          this.progressBar.logWarn(
            `${filePath}: didn't find any files in the archive, try disabling --input-checksum-quick`,
          );
        } else {
          this.progressBar.logWarn(`${filePath}: didn't find any files in the archive`);
        }
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
        .find((archive) => archive instanceof Gzip || archive instanceof Tar);
      if (archiveWithoutChecksums !== undefined) {
        this.progressBar.logWarn(
          `${archiveWithoutChecksums.getFilePath()}: quick checksums will skip ${archiveWithoutChecksums.getExtension()} files`,
        );
        return;
      }

      const chdInfos = await Promise.all(
        files
          .filter((file) => file instanceof ArchiveEntry)
          .map((archiveEntry) => archiveEntry.getArchive())
          .filter((archive) => archive instanceof Chd)
          .map(async (chd) => [chd, await chd.getInfo()] satisfies [Chd, CHDInfo]),
      );

      const cdRom = chdInfos.find(([, info]) => info.type === CHDType.CD_ROM);
      if (cdRom !== undefined) {
        this.progressBar.logWarn(
          `${cdRom[0].getFilePath()}: quick checksums will skip .cue/.bin files in CD-ROM CHDs`,
        );
        return;
      }

      const gdRom = chdInfos.find(([, info]) => info.type === CHDType.GD_ROM);
      if (gdRom !== undefined) {
        this.progressBar.logWarn(
          `${gdRom[0].getFilePath()}: quick checksums will skip .gdi/.bin/.raw files in GD-ROM CHDs`,
        );
      }
    }
  }
}
