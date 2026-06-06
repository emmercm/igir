import path from 'node:path';
import type stream from 'node:stream';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';

/**
 * A CHD that wraps a single raw image (hard disk, DVD-ROM, generic raw data, or the
 * data+metadata SHA1 view of a CD/GD-ROM).
 */
export default class ChdRaw extends Chd {
  /**
   * Construct a new {@link ChdRaw} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new ChdRaw(filePath);
  }

  /**
   * Returns true if the entry has non-zero size; the data+metadata view of a CD/GD-ROM cannot
   * be extracted.
   */
  canExtract(archiveEntry: ArchiveEntry<this>): boolean {
    // The data+metadata version of this file can't be extracted
    return archiveEntry.getSize() > 0;
  }

  /**
   * List the raw entries this CHD exposes.
   */
  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    const info = await this.getInfo();

    // MAME DAT <disk>s use the data+metadata SHA1 (vs. just the data SHA1)
    const rawEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: path.parse(this.getFilePath()).name,
        sha1: info.sha1,
        // There isn't a way for us to calculate these other checksums, so fill it in with garbage
        size: 0,
        crc32: checksumBitmask & ChecksumBitmask.CRC32 ? 'x'.repeat(8) : undefined,
        md5: checksumBitmask & ChecksumBitmask.MD5 ? 'x'.repeat(32) : undefined,
        sha256: checksumBitmask & ChecksumBitmask.SHA256 ? 'x'.repeat(64) : undefined,
      },
      checksumBitmask,
    );

    if (info.type === CHDType.CD_ROM || info.type === CHDType.GD_ROM) {
      // Some DAT groups such as https://github.com/UltraGodAzgorath/Unofficial-RA-DATs catalog
      // CD-ROMs by their "raw" SHA1, so we return that as candidate here. The "extracted" SHA1
      // immediately after this is the concatenation of all CD-ROM .bin files (which ChdBinCue knows
      // how to break apart with the cue sheet), it is not useful to return as a candidate here.
      return [rawEntry];
    }

    const extractedEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: path.parse(this.getFilePath()).name,
        size: info.logicalSize,
        /**
         * NOTE(cemmer): the "data SHA1" equals the original input file in these tested cases:
         *  - PSP .iso -> .chd with createdvd (and NOT createcd)
         */
        sha1: info.dataSha1,
      },
      checksumBitmask,
    );

    return [rawEntry, extractedEntry];
  }

  /**
   * Open a stream over the CHD's logical bytes, skipping the first `start` bytes, and invoke the
   * callback. A raw CHD exposes a single logical image, so the entry path is not needed to
   * resolve it.
   */
  override async extractEntryToStream<T>(
    entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const readable = await chdman.openRawReader({ inputFilename: this.getFilePath() });
    return await this.consumeEntryStream(entryPath, readable, callback, start);
  }
}
