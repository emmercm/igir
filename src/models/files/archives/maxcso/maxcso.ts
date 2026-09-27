import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import maxcso from '../../../../../packages/maxcso/index.js';
import Defaults from '../../../../globals/defaults.js';
import FsReadTransform, { type FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import StreamUtil from '../../../../utils/streamUtil.js';
import FileChecksums from '../../fileChecksums.js';
import type { ArchiveEntryLocation } from '../archive.js';
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
      { entryPath: '' },
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
    _location: ArchiveEntryLocation,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const sourceStream: stream.Readable = maxcso.openReader({
      inputFilename: this.getFilePath(),
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    // A non-zero start offset (e.g. a detected ROM header) must skip that many
    // leading bytes of the forward-only stream.
    return await StreamUtil.pipelineSafe(
      sourceStream,
      start > 0 ? new SkipBytesTransform(start) : undefined,
      callback,
    );
  }

  /**
   * Extract the disc image to the given path as an uncompressed ISO.
   */
  async extractEntryToFile(
    _location: ArchiveEntryLocation,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.extractEntryToStream({ entryPath: '' }, async (readable) => {
      const writeStream = fs.createWriteStream(extractedFilePath);
      if (callback) {
        await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
      } else {
        await stream.promises.pipeline(readable, writeStream);
      }
    });
  }
}
