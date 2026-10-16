import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import dolphinTool from '../../../../../addons/dolphin-tool/index.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
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
    end?: number,
  ): Promise<T> {
    const sourceStream: stream.Readable = dolphinTool.openReader({
      inputFilename: this.getFilePath(),
      highWaterMark: Archive.getStreamChunkSize(start, end),
    });
    return await Archive.pipelineRange(sourceStream, callback, start, end);
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
