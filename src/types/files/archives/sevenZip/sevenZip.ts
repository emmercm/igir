import path from 'node:path';

import _7z from '7zip-min';
import async from 'async';
import { Mutex } from 'async-mutex';

import Defaults from '../../../../globals/defaults.js';
import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import IgirException from '../../../exceptions/igirException.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default class SevenZip extends Archive {
  private static readonly LIST_MUTEX = new Mutex();

  protected new(filePath: string): Archive {
    return new SevenZip(filePath);
  }

  static getExtensions(): string[] {
    return ['.7z'];
  }

  getExtension(): string {
    return SevenZip.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    /**
     * WARN(cemmer): even with the above mutex, {@link _7z.list} will still sometimes return no
     * entries. This seems to happen more on older Node.js versions (v16, v18) and specific OSes
     * (Linux). Most archives contain at least one file, so assume this is wrong and attempt again
     * up to 5 times total.
     */
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const archiveEntries = await this.getArchiveEntriesNotCached(checksumBitmask);
      if (archiveEntries.length > 0) {
        return archiveEntries;
      }

      // Backoff with jitter
      if (attempt >= maxAttempts) {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** (attempt - 1) * 10));
      });
    }

    return [];
  }

  private async getArchiveEntriesNotCached(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     *  it will return no files but also no error. Try to prevent that behavior.
     */
    const filesIn7z = await SevenZip.LIST_MUTEX.runExclusive(async () => {
      try {
        return await _7z.list(this.getFilePath());
      } catch (error) {
        let message: string;
        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === 'string') {
          message = error;
        } else {
          message = 'failed to list files in archive';
        }
        throw new Error(message.replaceAll(/\n\n+/g, '\n').replaceAll(/^/gm, '   ').trim());
      }
    });

    return async.mapLimit(
      filesIn7z.filter((result) => !result.attr?.startsWith('D')),
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (result: _7z.ListItem): Promise<ArchiveEntry<this>> => {
        return ArchiveEntry.entryOf(
          {
            archive: this,
            entryPath: result.name,
            size: Number.parseInt(result.size, 10),
            crc32: result.crc,
            // If MD5, SHA1, or SHA256 is desired, this file will need to be extracted to calculate
          },
          checksumBitmask,
        );
      },
    );
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    const tempDir = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), '7z'));
    try {
      let tempFile = path.join(tempDir, entryPath);

      await _7z.cmd([
        // _7z.unpack() flags
        'x',
        this.getFilePath(),
        '-y',
        `-o${tempDir}`,
        // https://github.com/onikienko/7zip-min/issues/71
        // Extract only the single archive entry
        entryPath,
        '-r',
      ]);

      // https://github.com/onikienko/7zip-min/issues/86
      // Fix `7zip-min.list()` returning unicode entry names as � on Windows
      if (process.platform === 'win32' && !(await FsPoly.exists(tempFile))) {
        const files = await FsPoly.walk(tempDir);
        if (files.length === 0) {
          throw new IgirException('failed to extract any files');
        } else if (files.length > 1) {
          throw new IgirException('extracted too many files');
        }
        [tempFile] = files;
      }

      await FsPoly.mv(tempFile, extractedFilePath);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  }
}
