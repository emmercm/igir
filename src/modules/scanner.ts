import type { CHDInfo } from 'chdman';
import { CHDType } from 'chdman';

import type MappableSemaphore from '../async/mappableSemaphore.js';
import type ProgressBar from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Chd from '../types/files/archives/chd/chd.js';
import Gzip from '../types/files/archives/gzip.js';
import Tar from '../types/files/archives/tar.js';
import type File from '../types/files/file.js';
import type { ChecksumBitmaskValue } from '../types/files/fileChecksums.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import FileFactory from '../types/files/fileFactory.js';
import type Options from '../types/options.js';
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
    checksumArchives = false,
  ): Promise<File[]> {
    return (
      await this.mappableSemaphore.map(filePaths, async (inputFile) => {
        this.progressBar.incrementInProgress();
        const childBar = this.progressBar.addChildBar({
          name: inputFile,
          total: await FsPoly.size(inputFile),
          progressFormatter: FsPoly.sizeReadable,
        });

        let files: File[];
        try {
          files = await this.getFilesFromPath(inputFile, checksumBitmask, checksumArchives);
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

        await this.logWarnings(files);
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

      for (const fileFromPath of filesFromPath) {
        if (
          fileFromPath instanceof ArchiveEntry &&
          FileFactory.isExtensionArchive(fileFromPath.getExtractedFilePath())
        ) {
          this.progressBar.logWarn(
            `${filePath}: can't scan archives within archives: ${fileFromPath.getExtractedFilePath()}`,
          );
        }
      }

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
