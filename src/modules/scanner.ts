import { isNotJunk } from 'junk';

import type { CHDInfo } from '../../packages/chdman/index.js';
import { CHDType } from '../../packages/chdman/index.js';
import type MappableSemaphore from '../async/mappableSemaphore.js';
import type ProgressBar from '../console/progressBar.js';
import FileFactory from '../factories/fileFactory.js';
import ArchiveEntry from '../models/files/archives/archiveEntry.js';
import Gzip from '../models/files/archives/gzip.js';
import Tar from '../models/files/archives/tar.js';
import type File from '../models/files/file.js';
import type { ChecksumBitmaskValue } from '../models/files/fileChecksums.js';
import { ChecksumBitmask } from '../models/files/fileChecksums.js';
import type Options from '../models/options.js';
import ArrayUtil from '../utils/arrayUtil.js';
import FsUtil from '../utils/fsUtil.js';
import Module from './module.js';

/**
 * The base class for every input file scanner class.
 */
export default abstract class Scanner extends Module {
  protected readonly options: Options;
  protected readonly mappableSemaphore: MappableSemaphore;

  private readonly fileFactory: FileFactory;

  protected constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    mappableSemaphore: MappableSemaphore,
    loggerPrefix: string,
  ) {
    super(progressBar, loggerPrefix);
    this.options = options;
    this.mappableSemaphore = mappableSemaphore;
    this.fileFactory = fileFactory;
  }

  protected async getFilesFromPaths(
    filePaths: string[],
    checksumBitmask: number,
    shouldChecksumArchives = false,
  ): Promise<File[]> {
    return (
      await this.mappableSemaphore.map(filePaths, async (inputFile) => {
        this.progressBar.incrementInProgress();
        const childBar = this.progressBar.addChildBar({
          name: inputFile,
          total: await FsUtil.size(inputFile),
          progressFormatter: FsUtil.sizeReadable.bind(FsUtil),
        });

        let files: File[];
        try {
          files = await this.getFilesFromPath(
            inputFile,
            checksumBitmask,
            shouldChecksumArchives,
            childBar,
          );
        } finally {
          childBar.delete();
        }

        if (checksumBitmask) {
          // Do not return junk checksums
          // TODO(cemmer): this is inefficient, we shouldn't have junk checksums anywhere
          files = files.map((file) => {
            return file.withProps({
              crc32: /^[0-9a-f]{8}$/.test(file.getCrc32() ?? '') ? file.getCrc32() : undefined,
              crc32WithoutHeader: /^[0-9a-f]{8}$/.test(file.getCrc32WithoutHeader() ?? '')
                ? file.getCrc32WithoutHeader()
                : undefined,
              md5: /^[0-9a-f]{32}$/.test(file.getMd5() ?? '') ? file.getMd5() : undefined,
              md5WithoutHeader: /^[0-9a-f]{32}$/.test(file.getMd5WithoutHeader() ?? '')
                ? file.getMd5WithoutHeader()
                : undefined,
              sha1: /^[0-9a-f]{40}$/.test(file.getSha1() ?? '') ? file.getSha1() : undefined,
              sha1WithoutHeader: /^[0-9a-f]{40}$/.test(file.getSha1WithoutHeader() ?? '')
                ? file.getSha1WithoutHeader()
                : undefined,
              sha256: /^[0-9a-f]{64}$/.test(file.getSha256() ?? '') ? file.getSha256() : undefined,
              sha256WithoutHeader: /^[0-9a-f]{64}$/.test(file.getSha256WithoutHeader() ?? '')
                ? file.getSha256WithoutHeader()
                : undefined,
            });
          });

          // Constrain the checksums returned based on the requested bitmask
          files = files.map((file) => {
            if (file instanceof ArchiveEntry && this.options.getInputChecksumQuick()) {
              return file;
            }
            return file.withProps({
              crc32: checksumBitmask & ChecksumBitmask.CRC32 ? file.getCrc32() : undefined,
              crc32WithoutHeader:
                checksumBitmask & ChecksumBitmask.CRC32 ? file.getCrc32WithoutHeader() : undefined,
              md5: checksumBitmask & ChecksumBitmask.MD5 ? file.getMd5() : undefined,
              md5WithoutHeader:
                checksumBitmask & ChecksumBitmask.MD5 ? file.getMd5WithoutHeader() : undefined,
              sha1: checksumBitmask & ChecksumBitmask.SHA1 ? file.getSha1() : undefined,
              sha1WithoutHeader:
                checksumBitmask & ChecksumBitmask.SHA1 ? file.getSha1WithoutHeader() : undefined,
              sha256: checksumBitmask & ChecksumBitmask.SHA256 ? file.getSha256() : undefined,
              sha256WithoutHeader:
                checksumBitmask & ChecksumBitmask.SHA256
                  ? file.getSha256WithoutHeader()
                  : undefined,
              checksumBitmask,
            });
          });
        }

        this.logWarnings(files);
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
    return foundFiles.filter(ArrayUtil.filterUniqueMapped((file) => file.hashCode()));
  }

  private async getFilesFromPath(
    filePath: string,
    checksumBitmask: number,
    shouldChecksumArchives: boolean,
    progressBar: ProgressBar,
  ): Promise<File[]> {
    try {
      if (await FsUtil.isSymlink(filePath)) {
        const realFilePath = await FsUtil.readlinkResolved(filePath);
        if (!(await FsUtil.exists(realFilePath))) {
          this.prefixedLogger.warn(`${filePath}: broken symlink, '${realFilePath}' doesn't exist`);
          return [];
        }
      }

      const filesFromPath = await this.fileFactory.filesFrom(
        filePath,
        checksumBitmask,
        this.options.getInputChecksumQuick() ? ChecksumBitmask.NONE : checksumBitmask,
        (progress, total) => {
          progressBar.setCompleted(progress);
          if (total !== undefined) {
            progressBar.setTotal(total);
          }
        },
      );

      for (const fileFromPath of filesFromPath) {
        if (
          fileFromPath instanceof ArchiveEntry &&
          FileFactory.isExtensionArchive(fileFromPath.getExtractedFilePath())
        ) {
          this.prefixedLogger.warn(
            `${filePath}: can't scan archives within archives: ${fileFromPath.getExtractedFilePath()}`,
          );
        }
      }

      const isFileAnArchive = filesFromPath.some((file) => file instanceof ArchiveEntry);
      if (shouldChecksumArchives && isFileAnArchive) {
        filesFromPath.push(
          await this.fileFactory.fileFrom(filePath, checksumBitmask, (progress) => {
            progressBar.setCompleted(progress);
          }),
        );
      }

      if (filesFromPath.length === 0) {
        if (this.options.getInputChecksumQuick()) {
          this.prefixedLogger.warn(
            `${filePath}: didn't find any files in the archive, try disabling --input-checksum-quick`,
          );
        } else {
          this.prefixedLogger.warn(`${filePath}: didn't find any files in the archive`);
        }
      }
      return filesFromPath.filter(
        (fileFromPath) =>
          isNotJunk(fileFromPath.getFilePath()) &&
          (!(fileFromPath instanceof ArchiveEntry) ||
            isNotJunk(fileFromPath.getExtractedFilePath())),
      );
    } catch (error) {
      this.prefixedLogger.error(`${filePath}: failed to parse file: ${error}`);
      return [];
    }
  }

  private logWarnings(files: File[]): void {
    if (!this.options.getInputChecksumQuick()) {
      return;
    }
    const archiveWithoutChecksums = files
      .filter((file) => file instanceof ArchiveEntry)
      .map((archiveEntry) => archiveEntry.getArchive())
      .find((archive) => archive instanceof Gzip || archive instanceof Tar);
    if (archiveWithoutChecksums !== undefined) {
      this.prefixedLogger.warn(
        `${archiveWithoutChecksums.getFilePath()}: quick checksums will skip ${archiveWithoutChecksums.getExtension()} files`,
      );
    }
  }
}
