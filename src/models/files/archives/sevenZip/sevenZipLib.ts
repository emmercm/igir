import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import stream from 'node:stream';

import async from 'async';

import type { SevenZipEntry, SevenZipFormat } from '../../../../../packages/7zip/index.js';
import sevenZip from '../../../../../packages/7zip/index.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import FsReadTransform from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import FsUtil from '../../../../utils/fsUtil.js';
import type { ArchiveEntryLocation } from '../archive.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for archive formats handled by the bundled 7-Zip addon
 * ({@link packages/7zip}): 7z, Z, spanned ZIP, and ZipX.
 */
export default abstract class SevenZipLib extends Archive {
  /**
   * The 7-Zip handler to read this archive with. The addon takes no part in
   * guessing a format from a file's contents or name, so each subclass names the
   * one handler its extensions map to.
   */
  protected abstract getSevenZipFormat(): SevenZipFormat;

  /**
   * Returns true: 7-Zip-backed formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * The entry path to use for a format that records no name of its own. `.Z`
   * wraps a single nameless stream, and the convention every tool follows is to
   * name it after the archive with the extension removed, so `game.rom.Z` holds
   * `game.rom`.
   */
  private nameFromArchive(): string {
    return path.parse(this.getFilePath()).name;
  }

  private entryPathOf(entry: SevenZipEntry): string {
    return entry.entryPath ?? this.nameFromArchive();
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    // A file that cannot be opened as this format throws, and is meant to:
    // FileFactory.entriesFromArchive() turns that into a warning and falls back
    // to treating the path as a plain ROM. Swallowing it into an empty list
    // would instead drop the file from the scan entirely.
    const entries = await sevenZip.listEntries({
      inputFilename: this.getFilePath(),
      format: this.getSevenZipFormat(),
    });
    const fileEntries = entries.filter((entry) => !entry.isDirectory);

    if (callback) {
      callback(
        0,
        // `.Z` records no size, so its contribution to the total is unknown
        // until it has been read. Reporting it as 0 keeps the running progress
        // monotonic; it just finishes ahead of the bar.
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
    location: ArchiveEntryLocation,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    const extractedDir = path.dirname(extractedFilePath);
    if (!(await FsUtil.exists(extractedDir))) {
      await FsUtil.mkdir(extractedDir, { recursive: true });
    }

    await this.extractEntryToStream(location, async (readable) => {
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
  override async extractEntryToStream<T>(
    { entryPath, entryIndex }: ArchiveEntryLocation,
    callback: (readable: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const sourceStream = sevenZip.openEntryReader({
      inputFilename: this.getFilePath(),
      format: this.getSevenZipFormat(),
      entryPath: this.hasMeaningfulEntryPaths() ? entryPath : undefined,
      entryIndex,
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    const entryStream: Readable =
      start > 0 ? sourceStream.pipe(new SkipBytesTransform(start)) : sourceStream;

    try {
      return await callback(entryStream);
    } finally {
      // Both, because pipe() does not propagate destroy() upstream, and it is
      // the source that holds the addon's extraction thread. Leaving it running
      // is what a callback that stops short of the end of the entry would do.
      entryStream.destroy();
      sourceStream.destroy();
    }
  }
}
