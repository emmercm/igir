import path from 'node:path';

import async from 'async';

import chdman, { CHDType, readableFromReader } from '../../../../../packages/chdman/index.js';
import Defaults from '../../../../globals/defaults.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import FileChecksums, { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import type { ChdListing } from './chd.js';
import Chd from './chd.js';

/**
 * A CHD that represents a CD-ROM or GD-ROM, exposed as its constituent .cue and .bin tracks.
 */
export default class ChdBinCue extends Chd {
  /**
   * Construct a new {@link ChdBinCue} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new ChdBinCue(filePath);
  }

  /**
   * Returns true: bin/cue CHDs support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  protected async getListing(): Promise<ChdListing> {
    const prefix = path.parse(this.getFilePath()).name;
    const listing = await chdman.listCdBinCueTracks({
      inputFilename: this.getFilePath(),
      binNamePattern: `${prefix} (Track %t).bin`,
      cueName: `${prefix}.cue`,
    });
    return {
      mode: 'cuebin',
      tocFilename: `${prefix}.cue`,
      tocText: listing.tocText,
      files: [
        { filename: `${prefix}.cue`, size: listing.tocText.length },
        ...listing.tracks.map((track) => ({
          filename: track.filename,
          size: track.size,
          trackIndex: track.index,
        })),
      ],
    };
  }

  /**
   * List the .cue and .bin track entries this CHD exposes, computing each track's checksums.
   */
  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    if (checksumBitmask === ChecksumBitmask.NONE) {
      // Doing a quick scan
      return [];
    }

    const info = await this.getInfo();
    if (info.type !== CHDType.CD_ROM && info.type !== CHDType.GD_ROM) {
      // Not valid
      return [];
    }

    const listing = await this.getListing();

    // The .cue entry keeps junk size/checksums because we don't know what it should be
    const cueEntry = await ArchiveEntry.entryOf({
      archive: this,
      entryPath: listing.tocFilename,
      size: 0,
      crc32: checksumBitmask & ChecksumBitmask.CRC32 ? 'x'.repeat(8) : undefined,
      md5: checksumBitmask & ChecksumBitmask.MD5 ? 'x'.repeat(32) : undefined,
      sha1: checksumBitmask & ChecksumBitmask.SHA1 ? 'x'.repeat(40) : undefined,
      sha256: checksumBitmask & ChecksumBitmask.SHA256 ? 'x'.repeat(64) : undefined,
    });

    const trackFiles = listing.files.flatMap((file) =>
      file.trackIndex === undefined
        ? []
        : [{ filename: file.filename, size: file.size, trackIndex: file.trackIndex }],
    );
    const trackEntries = await async.mapLimit(
      trackFiles,
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (file: (typeof trackFiles)[number]): Promise<ArchiveEntry<this>> => {
        const reader = await chdman.openTrackReader({
          inputFilename: this.getFilePath(),
          mode: 'cuebin',
          trackIndex: file.trackIndex,
        });
        const checksums = await FileChecksums.hashStream(
          readableFromReader(reader),
          checksumBitmask,
        );
        return await ArchiveEntry.entryOf(
          { archive: this, entryPath: file.filename, size: file.size, ...checksums },
          checksumBitmask,
        );
      },
    );

    return [cueEntry, ...trackEntries];
  }
}
