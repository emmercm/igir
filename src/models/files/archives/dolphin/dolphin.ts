import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import dolphinTool from '../../../../../packages/dolphin-tool/index.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import FileChecksums from '../../fileChecksums.js';
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
      '',
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
    _entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    let readable: stream.Readable = await dolphinTool.openReader({
      inputFilename: this.getFilePath(),
    });
    // A non-zero start offset (e.g. a detected ROM header) must skip that many
    // leading bytes of the forward-only stream.
    if (start > 0) {
      readable = readable.pipe(new SkipBytesTransform(start));
    }
    try {
      return await callback(readable);
    } finally {
      readable.destroy();
    }
  }

  /**
   * Extract the disc image to the given path as an uncompressed ISO.
   */
  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await this.extractEntryToStream('', async (readable) => {
      await stream.promises.pipeline(readable, fs.createWriteStream(extractedFilePath));
    });
  }
}
