import fs from 'node:fs';
import stream from 'node:stream';

import { Memoize } from 'typescript-memoize';

import type { CHDInfo } from '../../../../../packages/chdman/index.js';
import chdman from '../../../../../packages/chdman/index.js';
import IgirException from '../../../../exceptions/igirException.js';
import FsReadTransform, { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import Archive from '../archive.js';

/**
 * How a single listed file is produced when a CHD is extracted.
 */
export interface ChdListedFile {
  // Output filename, equal to the {@link ArchiveEntry} path
  filename: string;
  // Byte size including any pregap/postgap
  size: number;
  // Undefined for the generated .cue/.gdi text file
  trackIndex?: number;
}

/**
 * The set of files a CHD exposes, plus the generated table-of-contents text.
 */
export interface ChdListing {
  mode: 'cuebin' | 'gdi';
  tocFilename: string;
  tocText: string;
  files: ChdListedFile[];
}

/**
 * Base class for MAME Compressed Hunks of Data (CHD) disc/disk image formats.
 */
export default abstract class Chd extends Archive {
  static getExtensions(): string[] {
    return ['.chd'];
  }

  getExtension(): string {
    return Chd.getExtensions()[0];
  }

  /**
   * Returns false: entry paths for CHD formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  /**
   * Extract the named entry from the CHD to the given file path.
   */
  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.extractEntryToStream(entryPath, async (readable) => {
      const writeStream = fs.createWriteStream(extractedFilePath);
      if (callback) {
        await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
      } else {
        await stream.promises.pipeline(readable, writeStream);
      }
    });
  }

  /**
   * Skip the first `start` bytes of an entry's stream, invoke the callback with it, and always
   * tear the stream down afterward. Subclasses resolve and open the per-entry readable
   * themselves and hand it here, so extracting one file never requires listing the whole CHD.
   */
  protected async consumeEntryStream<T>(
    entryPath: string,
    readable: stream.Readable,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start: number,
  ): Promise<T> {
    let result = readable;
    // A non-zero start offset (e.g. a detected ROM header) must skip that many
    // leading bytes of the forward-only stream.
    if (start > 0) {
      result = result.pipe(new SkipBytesTransform(start));
    }

    try {
      return await callback(result);
    } catch (error) {
      throw new IgirException(`failed to read ${this.getFilePath()}|${entryPath}: ${error}`);
    } finally {
      result.destroy();
    }
  }

  @Memoize()
  async getInfo(): Promise<CHDInfo> {
    return await chdman.info({ inputFilename: this.getFilePath() });
  }
}
