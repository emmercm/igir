import fs from 'node:fs';
import stream from 'node:stream';

import { Memoize } from 'typescript-memoize';

import type { CHDInfo, TrackReaderModeValue } from '../../../../../packages/chdman/index.js';
import chdman from '../../../../../packages/chdman/index.js';
import FsReadTransform, { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import Archive from '../archive.js';

/**
 * A single track file a CHD exposes when extracted. The generated .cue/.gdi text is carried
 * separately as {@link ChdListing.tocText}, not as one of these.
 */
export interface ChdListedFile {
  // Output filename, equal to the {@link ArchiveEntry} path
  filename: string;
  // Byte size including any pregap/postgap
  size: number;
  // 0-based chdman track index
  trackIndex: number;
}

/**
 * The track files a CHD exposes, plus the generated table-of-contents text.
 */
export interface ChdListing {
  mode: TrackReaderModeValue;
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

  @Memoize()
  async getInfo(): Promise<CHDInfo> {
    return await chdman.info({ inputFilename: this.getFilePath() });
  }
}
