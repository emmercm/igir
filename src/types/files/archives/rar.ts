import path from 'node:path';

import async from 'async';
import { Mutex } from 'async-mutex';
import type { FileHeader } from 'node-unrar-js/dist/index.js';
import { createExtractorFromFile } from 'node-unrar-js/dist/index.js';

import Defaults from '../../../globals/defaults.js';
import type { FsReadCallback } from '../../../polyfill/fsReadTransform.js';
import IgirException from '../../exceptions/igirException.js';
import type { ChecksumProps } from '../fileChecksums.js';
import FileChecksums, { ChecksumBitmask } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class Rar extends Archive {
  private static readonly EXTRACT_MUTEX = new Mutex();

  protected new(filePath: string): Archive {
    return new Rar(filePath);
  }

  static getExtensions(): string[] {
    return ['.rar'];
  }

  getExtension(): string {
    return Rar.getExtensions()[0];
  }

  canExtract(): boolean {
    return true;
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<this>[]> {
    const rar = await createExtractorFromFile({
      filepath: this.getFilePath(),
    });
    const fileHeaders = [...rar.getFileList().fileHeaders].filter(
      (fileHeader) => !fileHeader.flags.directory,
    );

    if (callback) {
      callback(
        0,
        fileHeaders.reduce((total, fileHeader) => total + fileHeader.unpSize, 0),
      );
    }
    let overallProgress = 0;

    return await async.mapLimit(
      fileHeaders,
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (fileHeader: FileHeader): Promise<ArchiveEntry<this>> => {
        // Calculate non-CRC32 checksums if needed
        let checksums: ChecksumProps = {};
        if (checksumBitmask & ~ChecksumBitmask.CRC32) {
          let lastProgress = 0;
          checksums = await this.extractEntryToStream(fileHeader.name, async (readable) => {
            return await FileChecksums.hashStream(readable, checksumBitmask, (progress) => {
              overallProgress = overallProgress - lastProgress + progress;
              if (callback) {
                callback(overallProgress);
                lastProgress = progress;
              }
            });
          });
        }
        const { crc32, ...checksumsWithoutCrc } = checksums;

        const entry = await ArchiveEntry.entryOf(
          {
            archive: this,
            entryPath: fileHeader.name,
            size: fileHeader.unpSize,
            crc32: crc32 ?? fileHeader.crc.toString(16),
            ...checksumsWithoutCrc,
          },
          checksumBitmask,
        );
        overallProgress += fileHeader.unpSize;
        if (callback) {
          callback(overallProgress);
        }
        return entry;
      },
    );
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    /**
     * WARN(cemmer): {@link unrar.extract} seems to have issues with extracting files to different
     * directories at the same time, it will sometimes extract to the wrong directory. Try to
     * prevent that behavior.
     */
    await Rar.EXTRACT_MUTEX.runExclusive(async () => {
      const rar = await createExtractorFromFile({
        filepath: this.getFilePath(),
        targetPath: path.dirname(extractedFilePath),
        filenameTransform: () => path.basename(extractedFilePath),
      });
      // For whatever reason, the library author decided to delay extraction until the file is
      // iterated, so we have to execute this expression, but can throw away the results
      const extracted = [
        ...rar.extract({
          files: [entryPath.replaceAll('\\', '/')],
        }).files,
      ];
      if (extracted.length === 0) {
        throw new IgirException(`didn't find entry '${entryPath}'`);
      }
    });
  }
}
