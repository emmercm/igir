import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import maxcso from '../../../../../addons/maxcso/index.js';
import FsReadTransform, { type FsReadCallback } from '../../../../streams/fsReadTransform.js';
import FileChecksums from '../../fileChecksums.js';
import type { ArchiveEntryRef } from '../archive.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for the maxcso family of compressed disc image formats (CSO, DAX, ZSO).
 */
export default abstract class Maxcso extends Archive {
  /**
   * Returns true: maxcso formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns false: entry paths for maxcso formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  /**
   * List the single ISO the disc image holds, computing every requested checksum in one
   * decompression pass.
   */
  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;

    const info = await maxcso.info({ inputFilename: this.getFilePath() });
    if (callback) {
      callback(0, info.uncompressedSize);
    }

    // Compute every requested checksum in a single decompression pass. A decode error on a
    // corrupt block surfaces as a stream error, which is the integrity check.
    const checksums = await this.extractEntryToStream(
      { entryPath: '', size: info.uncompressedSize },
      async (readable) => await FileChecksums.hashStream(readable, checksumBitmask, callback),
    );

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: info.uncompressedSize,
          ...checksums,
        },
        checksumBitmask,
      ),
    ];
  }

  /**
   * Open a stream over the disc image's decompressed ISO bytes, skipping the first `start`
   * bytes, and invoke the callback. A maxcso disc image exposes a single logical ISO, so the
   * entry path is not needed to resolve it.
   */
  override async extractEntryToStream<T>(
    entryRef: ArchiveEntryRef,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
    end?: number,
  ): Promise<T> {
    const sourceStream: stream.Readable = maxcso.openReader({
      inputFilename: this.getFilePath(),
      highWaterMark: Archive.getStreamChunkSize(start, end, entryRef.size),
    });
    return await Archive.pipelineRange(sourceStream, callback, start, end);
  }

  /**
   * Extract the disc image to the given path as an uncompressed ISO.
   */
  async extractEntryToFile(
    entryRef: ArchiveEntryRef,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.extractEntryToStream(entryRef, async (readable) => {
      const writeStream = fs.createWriteStream(extractedFilePath);
      if (callback) {
        await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
      } else {
        await stream.promises.pipeline(readable, writeStream);
      }
    });
  }
}
