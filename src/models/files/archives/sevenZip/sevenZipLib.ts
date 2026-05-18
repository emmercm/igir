// This must be imported before '7z-iterator'!
import './lzmaNativeDisable.js';

import path from 'node:path';

import type { Entry, SevenZipEntry } from '7z-iterator';
import _7zIterator from '7z-iterator';
import async from 'async';

import IgirException from '../../../../exceptions/igirException.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import FsUtil, { WalkMode } from '../../../../utils/fsUtil.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for archive formats handled by the 7-Zip library (7z, Z, spanned ZIP, ZipX).
 */
export default abstract class SevenZipLib extends Archive {
  /**
   * Returns true: 7-Zip-backed formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
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
      const fileEntries = entriesIn7z.filter((entry) => entry.type === 'file');

      if (callback) {
        callback(
          0,
          fileEntries.reduce((total, entry) => total + entry.size, 0),
        );
      }
      let overallProgress = 0;

      return await async.mapLimit(
        fileEntries,
        Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
        async (entry: SevenZipEntry): Promise<ArchiveEntry<this>> => {
          const archiveEntry = await ArchiveEntry.entryOf(
            {
              archive: this,
              entryPath: entry.path,
              size: entry.size,
              crc32: entry._crc?.toString(16).toLowerCase().padStart(8, '0'),
              // If MD5, SHA1, or SHA256 is desired, this file will need to be extracted to calculate
            },
            checksumBitmask,
          );
          overallProgress += entry.size;
          if (callback) {
            callback(overallProgress);
          }
          return archiveEntry;
        },
      );
    } finally {
      iterator.destroy();
    }
  }

  /**
   * Extract the named entry from the archive to the given file path.
   */
  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    const iterator = new _7zIterator(this.getFilePath());
    try {
      let foundEntry: Entry | undefined = undefined;
      for await (const entry of iterator) {
        if (entry.path.replaceAll('\\', '/') === entryPath.replaceAll('\\', '/')) {
          foundEntry = entry;
        } else {
          entry.destroy();
        }
      }
      if (foundEntry === undefined) {
        throw new IgirException(`failed to find archive entry '${entryPath}'`);
      }

      const extractDir = await FsUtil.mktemp(path.join(extractedFilePath));
      try {
        await foundEntry.create(extractDir, {});
        // 7z-iterator doesn't let you specify the exact file path
        const extractedFiles = await FsUtil.walk(extractDir, WalkMode.FILES);
        if (extractedFiles.length === 0) {
          throw new IgirException(`failed to extract`);
        }
        await FsUtil.mv(extractedFiles[0], extractedFilePath);
      } finally {
        await FsUtil.rm(extractDir, { recursive: true, force: true });
      }
    } finally {
      iterator.destroy();
    }
  }
}
