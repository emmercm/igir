import fs from 'node:fs';
import stream from 'node:stream';

import { Memoize } from 'typescript-memoize';

import type { CHDInfo } from '../../../../../packages/chdman/index.js';
import chdman, { readableFromReader } from '../../../../../packages/chdman/index.js';
import IgirException from '../../../../exceptions/igirException.js';
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
 * A {@link stream.Transform} that drops the first `count` bytes of its input.
 */
class SkipBytesTransform extends stream.Transform {
  private remaining: number;

  constructor(count: number) {
    super();
    this.remaining = count;
  }

  /**
   * Pass through bytes after the leading `count` bytes have been dropped.
   */
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: stream.TransformCallback,
  ): void {
    if (this.remaining > 0) {
      if (chunk.length <= this.remaining) {
        this.remaining -= chunk.length;
        callback();
        return;
      }
      const sliced = chunk.subarray(this.remaining);
      this.remaining = 0;
      callback(undefined, sliced);
      return;
    }
    callback(undefined, chunk);
  }
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

  protected abstract getListing(): Promise<ChdListing>;

  /**
   * Open a {@link stream.Readable} for one listed file, decompressing only that file's data.
   */
  protected async streamFile(file: ChdListedFile, listing: ChdListing): Promise<stream.Readable> {
    if (file.trackIndex === undefined) {
      return stream.Readable.from(Buffer.from(listing.tocText));
    }
    const reader = await chdman.openTrackReader({
      inputFilename: this.getFilePath(),
      mode: listing.mode,
      trackIndex: file.trackIndex,
    });
    return readableFromReader(reader);
  }

  /**
   * Extract the named entry from the CHD to the given file path.
   */
  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    await this.extractEntryToStream(entryPath, async (readable) => {
      await stream.promises.pipeline(readable, fs.createWriteStream(extractedFilePath));
    });
  }

  /**
   * Open a stream for the named entry, skipping the first `start` bytes, and invoke the callback
   * with it.
   */
  override async extractEntryToStream<T>(
    entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    const listing = await this.getListing();
    const file = listing.files.find((listedFile) => listedFile.filename === entryPath);
    if (file === undefined) {
      throw new IgirException(`CHD entry not found: ${this.getFilePath()}|${entryPath}`);
    }

    let readable = await this.streamFile(file, listing);
    // Preserve base-class semantics: a non-zero start offset (e.g. a detected ROM
    // header) must skip that many leading bytes of the forward-only stream.
    if (start > 0) {
      readable = readable.pipe(new SkipBytesTransform(start));
    }

    try {
      return await callback(readable);
    } catch (error) {
      throw new IgirException(`failed to read ${this.getFilePath()}|${entryPath}: ${error}`);
    } finally {
      readable.destroy();
    }
  }

  @Memoize()
  async getInfo(): Promise<CHDInfo> {
    return await chdman.info({ inputFilename: this.getFilePath() });
  }
}
