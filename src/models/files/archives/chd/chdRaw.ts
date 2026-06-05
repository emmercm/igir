import path from 'node:path';
import type stream from 'node:stream';

import chdman, { CHDType, readableFromReader } from '../../../../../packages/chdman/index.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import type { ChdListing } from './chd.js';
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
   * Describe the single logical file this CHD exposes, without decompressing it.
   */
  protected async getListing(): Promise<ChdListing> {
    const name = path.parse(this.getFilePath()).name;
    const info = await this.getInfo();
    return {
      mode: 'cuebin',
      tocFilename: name,
      tocText: '',
      files: [{ filename: name, size: info.logicalSize, trackIndex: 0 }],
    };
  }

  /**
   * Open a Node Readable over the CHD's logical bytes, decompressing on demand.
   */
  protected override async streamFile(): Promise<stream.Readable> {
    const reader = await chdman.openRawReader({ inputFilename: this.getFilePath() });
    return readableFromReader(reader);
  }
}
