import path from 'node:path';
import stream from 'node:stream';

import async from 'async';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import IgirException from '../../../../exceptions/igirException.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
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

  private async getListing(): Promise<ChdListing> {
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
   * Stream one entry: the .gdi TOC text, or a track resolved by its number (the `trackNN`
   * produced by {@link getListing}'s pattern maps to chdman track index NN - 1).
   */
  private async streamFile(entryPath: string): Promise<stream.Readable> {
    if (entryPath.toLowerCase().endsWith('.gdi')) {
      return stream.Readable.from(Buffer.from((await this.getListing()).tocText));
    }
    const trackNumber = /track(\d+)\.(?:bin|raw)$/i.exec(entryPath);
    if (trackNumber === null) {
      throw new IgirException(`CHD entry not found: ${this.getFilePath()}|${entryPath}`);
    }
    return await chdman.openTrackReader({
      inputFilename: this.getFilePath(),
      mode: 'gdi',
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
    return await this.consumeEntryStream(
      entryPath,
      await this.streamFile(entryPath),
      callback,
      start,
    );
  }

  /**
   * List the .gdi and track entries this CHD exposes, computing each entry's checksums.
   */
  async getArchiveEntries(
    checksumBitmask: ChecksumBitmaskValue,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<this>[]> {
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
      async (file: (typeof trackFiles)[number]): Promise<ArchiveEntry<this>> => {
        const readable = await chdman.openTrackReader({
          inputFilename: this.getFilePath(),
          mode: 'gdi',
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

    return [gdiEntry, ...trackEntries];
  }
}
