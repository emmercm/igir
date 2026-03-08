import path from 'node:path';

import type { Entry, SevenZipEntry } from '7z-iterator';
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
    const iterator = new _7zIterator(this.getFilePath());
    try {
      try {
        for await (const entry of iterator) {
          entry.destroy();
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
    } finally {
      iterator.destroy();
    }
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    const iterator = new _7zIterator(this.getFilePath());
    try {
      let foundEntry: Entry | undefined = undefined;
      for await (const entry of iterator) {
        if (entry.path === entryPath.replaceAll(/[\\/]/g, '/')) {
          foundEntry = entry;
        } else {
          entry.destroy();
        }
      }
      if (foundEntry === undefined) {
        throw new IgirException(`failed to find archive entry '${entryPath}'`);
      }

      const extractDir = await FsPoly.mktemp(path.join(extractedFilePath));
      try {
        await foundEntry.create(extractDir, {});
        // 7z-iterator doesn't let you specify the exact file path
        const extractedFiles = await FsPoly.walk(extractDir, WalkMode.FILES);
        if (extractedFiles.length === 0) {
          throw new IgirException(`failed to extract`);
        }
        await FsPoly.mv(extractedFiles[0], extractedFilePath);
      } finally {
        await FsPoly.rm(extractDir, { recursive: true, force: true });
      }
    } finally {
      iterator.destroy();
    }
  }
}
