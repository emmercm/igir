import path from 'node:path';

import _7z, { Result } from '7zip-min';
import async, { AsyncResultCallback } from 'async';
import { Mutex } from 'async-mutex';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class SevenZip extends Archive {
  private static readonly LIST_MUTEX = new Mutex();

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new SevenZip(filePath);
  }

  static getExtensions(): string[] {
    return ['.7z'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return SevenZip.getExtensions()[0];
  }

  static getFileSignatures(): Buffer[] {
    return [Buffer.from('377ABCAF271C', 'hex')];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    /**
     * WARN(cemmer): even with the above mutex, {@link _7z.list} will still sometimes return no
     *  entries. Most archives contain at least one file, so assume this is wrong and attempt
     *  again up to 3 times total.
     */
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const archiveEntries = await this.getArchiveEntriesNotCached(checksumBitmask);
      if (archiveEntries.length > 0) {
        return archiveEntries;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** (attempt - 1) * 100));
      });
    }

    return [];
  }

  private async getArchiveEntriesNotCached(
    checksumBitmask: number,
  ): Promise<ArchiveEntry<this>[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     *  it will return no files but also no error. Try to prevent that behavior.
     */
    const filesIn7z = await SevenZip.LIST_MUTEX.runExclusive(
      async () => new Promise<Result[]>((resolve, reject) => {
        _7z.list(this.getFilePath(), (err, result) => {
          if (err) {
            const msg = err.toString()
              .replace(/\n\n+/g, '\n')
              .replace(/^/gm, '   ')
              .trim();
            reject(msg);
          } else {
            // https://github.com/onikienko/7zip-min/issues/70
            // If `7zip-min.list()` failed to parse the entry name then ignore it
            resolve(result.filter((entry) => entry.name));
          }
        });
      }),
    );

    return async.mapLimit(
      filesIn7z.filter((result) => !result.attr?.startsWith('D')),
      Constants.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (result, callback: AsyncResultCallback<ArchiveEntry<this>, Error>) => {
        const archiveEntry = await ArchiveEntry.entryOf({
          archive: this,
          entryPath: result.name,
          size: Number.parseInt(result.size, 10),
          crc32: result.crc,
          // If MD5, SHA1, or SHA256 is desired, this file will need to be extracted to calculate
        }, checksumBitmask);
        callback(undefined, archiveEntry);
      },
    );
  }

  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, '7z'));
    try {
      let tempFile = path.join(tempDir, entryPath);
      await new Promise<void>((resolve, reject) => {
        _7z.cmd([
          // _7z.unpack() flags
          'x',
          this.getFilePath(),
          '-y',
          `-o${tempDir}`,
          // https://github.com/onikienko/7zip-min/issues/71
          // Extract only the single archive entry
          entryPath,
          '-r',
        ], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // https://github.com/onikienko/7zip-min/issues/86
      // Fix `7zip-min.list()` returning unicode entry names as � on Windows
      if (process.platform === 'win32' && !await fsPoly.exists(tempFile)) {
        const files = await fsPoly.walk(tempDir);
        if (files.length === 0) {
          throw new Error('failed to extract any files');
        } else if (files.length > 1) {
          throw new Error('extracted too many files');
        }
        [tempFile] = files;
      }

      await fsPoly.mv(tempFile, extractedFilePath);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true, force: true });
    }
  }
}
