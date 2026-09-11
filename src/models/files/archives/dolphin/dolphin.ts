import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import dolphinTool from '../../../../../packages/dolphin-tool/index.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import StreamUtil from '../../../../utils/streamUtil.js';
import FileChecksums from '../../fileChecksums.js';
import type { ArchiveEntryLocation } from '../archive.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for Dolphin-emulator compressed disc image formats (GCZ, RVZ, WIA).
 */
export default abstract class Dolphin extends Archive {
  /**
   * Returns true: Dolphin formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns false: entry paths for Dolphin formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;

    const info = await dolphinTool.info({ inputFilename: this.getFilePath() });
    if (callback) {
      callback(0, info.decompressedSize);
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
          size: info.decompressedSize,
          ...checksums,
        },
        checksumBitmask,
      ),
    ];
  }

  /**
   * Open a stream over the disc image's decompressed ISO bytes, skipping the first `start`
   * bytes, and invoke the callback. A Dolphin disc image exposes a single logical ISO, so the
   * entry path is not needed to resolve it.
   */
  override async extractEntryToStream<T>(
    _location: ArchiveEntryLocation,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const sourceStream: stream.Readable = dolphinTool.openReader({
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
  ): Promise<void> {
    await this.extractEntryToStream({ entryPath: '' }, async (readable) => {
      await stream.promises.pipeline(readable, fs.createWriteStream(extractedFilePath));
    });
  }
}
