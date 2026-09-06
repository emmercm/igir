import path from 'node:path';
import stream from 'node:stream';

import async from 'async';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import IgirException from '../../../../exceptions/igirException.js';
import Defaults from '../../../../globals/defaults.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../../streams/skipBytesTransform.js';
import StreamUtil from '../../../../utils/streamUtil.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import FileChecksums, { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import type { ArchiveEntryLocation } from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import type { ChdListedFile, ChdListing } from './chd.js';
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
      files: listing.tracks.map((track) => ({
        filename: track.filename,
        size: track.size,
        trackIndex: track.index,
      })),
    };
  }

  /**
   * Stream one entry: the TOC text, or the track the entry's index names.
   */
  private async streamFile({
    entryPath,
    entryIndex,
  }: ArchiveEntryLocation): Promise<stream.Readable> {
    if (entryPath.toLowerCase().endsWith('.gdi')) {
      return stream.Readable.from(Buffer.from((await this.getListing()).tocText));
    }
    if (entryIndex === undefined) {
      throw new IgirException(`CHD entry has no track index: ${this.getFilePath()}|${entryPath}`);
    }
    return chdman.openTrackReader({
      inputFilename: this.getFilePath(),
      mode: 'gdi',
      trackIndex: entryIndex,
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
  }

  /**
   * Open a stream for the named entry, skipping the first `start` bytes, and invoke the callback.
   */
  override async extractEntryToStream<T>(
    location: ArchiveEntryLocation,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const sourceStream = await this.streamFile(location);
    // A non-zero start offset (e.g. a detected ROM header) must skip that many
    // leading bytes of the forward-only stream.
    return await StreamUtil.pipelineSafe(
      sourceStream,
      start > 0 ? new SkipBytesTransform(start) : undefined,
      callback,
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
        const readable = chdman.openTrackReader({
          inputFilename: this.getFilePath(),
          mode: 'gdi',
          trackIndex: file.trackIndex,
          highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
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
          {
            archive: this,
            entryPath: file.filename,
            entryIndex: file.trackIndex,
            size: file.size,
            ...checksums,
          },
          checksumBitmask,
        );
      },
    );

    return [gdiEntry, ...trackEntries];
  }
}
