import path from 'node:path';

import type { SevenZipEntry } from '7z-iterator';
import _7zIterator from '7z-iterator';
import async from 'async';

import Defaults from '../../../../globals/defaults.js';
import FsPoly, { WalkMode } from '../../../../polyfill/fsPoly.js';
import IgirException from '../../../exceptions/igirException.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default class SevenZip extends Archive {
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
    const iterator = new _7zIterator(this.getFilePath());
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _entry of iterator) {
        // do nothing, just iterate everything so getStreamingOrder() works
      }
    } catch (error) {
      if ((error as Error & { code: string }).code === 'CORRUPT_HEADER') {
        // This will happen for valid archives with no files
        return [];
      }
      throw error;
    }
    const entriesIn7z = iterator.getStreamingOrder();

    return await async.mapLimit(
      entriesIn7z.filter((entry) => entry.type === 'file'),
      //filesIn7z.filter((result) => !result.attr?.startsWith('D')),
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (entry: SevenZipEntry): Promise<ArchiveEntry<this>> => {
        return await ArchiveEntry.entryOf(
          {
            archive: this,
            entryPath: entry.path,
            size: entry.size,
            crc32: entry._crc?.toString(16).toLowerCase().padStart(8, '0'),
            // If MD5, SHA1, or SHA256 is desired, this file will need to be extracted to calculate
          },
          checksumBitmask,
        );
      },
    );
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    const iterator = new _7zIterator(this.getFilePath());
    for await (const entry of iterator) {
      if (entry.path !== entryPath) {
        continue;
      }

      const extractDir = await FsPoly.mktemp(path.join(extractedFilePath));
      try {
        await entry.create(extractDir, {});
        // 7z-iterator doesn't let you specify the exact file path
        const extractedFiles = await FsPoly.walk(extractDir, WalkMode.FILES);
        if (extractedFiles.length === 0) {
          throw new IgirException(`failed to extract`);
        }
        await FsPoly.mv(extractedFiles[0], extractedFilePath);
      } finally {
        await FsPoly.rm(extractDir, { recursive: true, force: true });
      }

      iterator.end();
      return;
    }

    throw new IgirException(`failed to find archive entry`);
  }
}
