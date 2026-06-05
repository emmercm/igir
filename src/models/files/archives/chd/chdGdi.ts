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
 * A CHD that represents a GD-ROM, exposed as its constituent .gdi and track files.
 */
export default class ChdGdi extends Chd {
  /**
   * Construct a new {@link ChdGdi} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new ChdGdi(filePath);
  }

  /**
   * Returns true: GD-ROM CHDs support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  protected async getListing(): Promise<ChdListing> {
    const prefix = path.parse(this.getFilePath()).name;
    const listing = await chdman.listGdRomTracks({
      inputFilename: this.getFilePath(),
      trackBaseName: 'track',
      gdiName: `${prefix}.gdi`,
    });
    // listGdRomTracks already returns TOSEC-style CRLF-normalized TOC text
    return {
      mode: 'gdi',
      tocFilename: `${prefix}.gdi`,
      tocText: listing.tocText,
      files: [
        { filename: `${prefix}.gdi`, size: listing.tocText.length },
        ...listing.tracks.map((track) => ({
          filename: track.filename,
          size: track.size,
          trackIndex: track.index,
        })),
      ],
    };
  }

  /**
   * List the .gdi and track entries this CHD exposes, computing each entry's checksums.
   */
  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    if (checksumBitmask === ChecksumBitmask.NONE) {
      // Doing a quick scan
      return [];
    }

    if ((await this.getInfo()).type !== CHDType.GD_ROM) {
      // Not valid
      return [];
    }

    const listing = await this.getListing();

    const gdiEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: listing.tocFilename,
        size: listing.tocText.length,
        ...(await FileChecksums.hashData(listing.tocText, checksumBitmask)),
      },
      checksumBitmask,
    );

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
          mode: 'gdi',
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

    return [gdiEntry, ...trackEntries];
  }
}
