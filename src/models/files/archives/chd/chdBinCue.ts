import path from 'node:path';
import stream from 'node:stream';

import async from 'async';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import IgirException from '../../../../exceptions/igirException.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import FileChecksums, { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import type { ChdListedFile, ChdListing } from './chd.js';
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

  private async getListing(): Promise<ChdListing> {
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
      files: listing.tracks.map((track) => ({
        filename: track.filename,
        size: track.size,
        trackIndex: track.index,
      })),
    };
  }

  /**
   * Stream one entry: the .cue TOC text, or a .bin track resolved by its track number (the
   * `(Track N)` produced by {@link getListing}'s pattern maps to chdman track index N - 1).
   */
  private async streamFile(entryPath: string): Promise<stream.Readable> {
    if (entryPath.toLowerCase().endsWith('.cue')) {
      return stream.Readable.from(Buffer.from((await this.getListing()).tocText));
    }
    const trackNumber = /\(Track (\d+)\)\.bin$/i.exec(entryPath);
    if (trackNumber === null) {
      throw new IgirException(`CHD entry not found: ${this.getFilePath()}|${entryPath}`);
    }
    return await chdman.openTrackReader({
      inputFilename: this.getFilePath(),
      mode: 'cuebin',
      trackIndex: Number(trackNumber[1]) - 1,
    });
  }

  /**
   * Open a stream for the named entry, skipping the first `start` bytes, and invoke the callback.
   */
  override async extractEntryToStream<T>(
    entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    let readable = await this.streamFile(entryPath);
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
   * List the .cue and .bin track entries this CHD exposes, computing each track's checksums.
   */
  async getArchiveEntries(
    checksumBitmask: ChecksumBitmaskValue,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<this>[]> {
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

    const trackFiles = listing.files;
    if (callback) {
      callback(
        0,
        trackFiles.reduce((total, file) => total + file.size, 0),
      );
    }
    let overallProgress = 0;
    const trackEntries = await async.mapLimit(
      trackFiles,
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (file: ChdListedFile): Promise<ArchiveEntry<this>> => {
        const readable = await chdman.openTrackReader({
          inputFilename: this.getFilePath(),
          mode: 'cuebin',
          trackIndex: file.trackIndex,
        });
        let lastProgress = 0;
        const checksums = await FileChecksums.hashStream(readable, checksumBitmask, (progress) => {
          overallProgress = overallProgress - lastProgress + progress;
          if (callback) {
            callback(overallProgress);
          }
          lastProgress = progress;
        });
        return await ArchiveEntry.entryOf(
          { archive: this, entryPath: file.filename, size: file.size, ...checksums },
          checksumBitmask,
        );
      },
    );

    return [cueEntry, ...trackEntries];
  }
}
