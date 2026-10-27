import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import stream from 'node:stream';

import async from 'async';

import type { SevenZipEntry, SevenZipFormat } from '../../../../../addons/7zip/index.js';
import sevenZip from '../../../../../addons/7zip/index.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import FsReadTransform from '../../../../streams/fsReadTransform.js';
import FsUtil from '../../../../utils/fsUtil.js';
import type { ArchiveEntryRef } from '../archive.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for archive formats read through the bundled 7-Zip addon. Subclasses
 * supply the handler to read with, and everything else is shared.
 */
export default abstract class SevenZipLib extends Archive {
  /**
   * The 7-Zip handler to read this archive with. Nothing guesses a format from a
   * file's contents or name, so each subclass names the one its extensions map to.
   */
  protected abstract getSevenZipFormat(): SevenZipFormat;

  /**
   * Returns true: 7-Zip-backed formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  private entryPathOf(entry: SevenZipEntry): string {
    // Not every archive type can provide meaningful entry paths; default to the archive's name,
    // without the number of the first part when it's split into numbered parts
    return entry.entryPath ?? path.parse(this.getFilePath().replace(/\.001$/, '')).name;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entries = await sevenZip.listEntries({
      inputFilename: this.getFilePath(),
      format: this.getSevenZipFormat(),
    });
    const fileEntries = entries.filter((entry) => !entry.isDirectory);

    if (callback) {
      callback(
        0,
        // Not every archive type has filesize metadata, so we have to default it
        fileEntries.reduce((total, entry) => total + (entry.size ?? 0), 0),
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
            entryPath: this.entryPathOf(entry),
            size: entry.size,
            crc32: entry.crc32,
            entryIndex: entry.entryIndex,
          },
          checksumBitmask,
        );
        overallProgress += entry.size ?? 0;
        if (callback) {
          callback(overallProgress);
        }
        return archiveEntry;
      },
    );
  }

  /**
   * Extract the named entry from the archive to the given file path.
   */
  async extractEntryToFile(
    entryRef: ArchiveEntryRef,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    const extractedDir = path.dirname(extractedFilePath);
    if (!(await FsUtil.exists(extractedDir))) {
      await FsUtil.mkdir(extractedDir, { recursive: true });
    }

    await this.extractEntryToStream(entryRef, async (readable) => {
      // The addon defers opening the archive until the stream is first read, so cause it to open.
      // We do this so any immediate issue with the input will throw before we create the output.
      await events.once(readable, 'readable');

      const writeStream = fs.createWriteStream(extractedFilePath);
      if (callback) {
        await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
      } else {
        await stream.promises.pipeline(readable, writeStream);
      }
    });
  }

  /**
   * Invoke the callback with a readable stream of the named entry's uncompressed bytes.
   */
  protected override async streamEntry<T>(
    { entryPath, entryIndex, size }: ArchiveEntryRef,
    callback: (source: Readable) => Promise<T>,
    byteCount?: number,
  ): Promise<T> {
    const sourceStream = sevenZip.openEntryReader({
      inputFilename: this.getFilePath(),
      format: this.getSevenZipFormat(),
      entryPath: this.hasMeaningfulEntryPaths() ? entryPath : undefined,
      entryIndex,
      highWaterMark: Archive.getStreamChunkSize(size, byteCount),
    });
    return await callback(sourceStream);
  }
}
