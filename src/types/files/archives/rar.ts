import path from 'node:path';

import async, { AsyncResultCallback } from 'async';
import { Mutex } from 'async-mutex';
import unrar from 'node-unrar-js';

import Defaults from '../../../globals/defaults.js';
import ExpectedError from '../../expectedError.js';
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

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
    });
    return async.mapLimit(
      [...rar.getFileList().fileHeaders].filter((fileHeader) => !fileHeader.flags.directory),
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (fileHeader, callback: AsyncResultCallback<ArchiveEntry<this>, Error>) => {
        const archiveEntry = await ArchiveEntry.entryOf(
          {
            archive: this,
            entryPath: fileHeader.name,
            size: fileHeader.unpSize,
            crc32: fileHeader.crc.toString(16),
            // If MD5, SHA1, or SHA256 is desired, this file will need to be extracted to calculate
          },
          checksumBitmask,
        );
        callback(undefined, archiveEntry);
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
      const rar = await unrar.createExtractorFromFile({
        filepath: this.getFilePath(),
        targetPath: path.dirname(extractedFilePath),
        filenameTransform: () => path.basename(extractedFilePath),
      });
      // For whatever reason, the library author decided to delay extraction until the file is
      // iterated, so we have to execute this expression, but can throw away the results
      const extracted = [
        ...rar.extract({
          files: [entryPath.replace(/[\\/]/g, '/')],
        }).files,
      ];
      if (extracted.length === 0) {
        throw new ExpectedError(`didn't find entry '${entryPath}'`);
      }
    });
  }
}
