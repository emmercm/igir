import path from 'node:path';
import type { Readable } from 'node:stream';

import Defaults from '../../../globals/defaults.js';
import Temp from '../../../globals/temp.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import LimitBytesTransform from '../../../streams/limitBytesTransform.js';
import SkipBytesTransform from '../../../streams/skipBytesTransform.js';
import FsUtil from '../../../utils/fsUtil.js';
import StreamUtil from '../../../utils/streamUtil.js';
import File from '../file.js';
import type ArchiveEntry from './archiveEntry.js';

/**
 * Where an entry lives inside its {@link Archive}: the path it was listed under, and optionally
 * the position it was listed at.
 */
export interface ArchiveEntryLocation {
  readonly entryPath: string;
  /**
   * The entry's position in the archive's own item table, as the archive itself orders it.
   */
  readonly entryIndex?: number;
}

/**
 * Base class for an archive file format, providing entry enumeration and extraction.
 */
export default abstract class Archive {
  // A reasonable high watermark minimum, but still above zlib's minimum chunk size of 64 bytes
  private static readonly MIN_STREAM_CHUNK_SIZE = 4 * 1024;

  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  protected abstract new(filePath: string): Archive;

  /**
   * @returns every extension that is valid for this archive type, with the canonical one first
   */
  abstract getExtensions(): string[];

  /**
   * @returns the canonical extension for this archive type
   */
  getExtension(): string {
    return this.getExtensions()[0];
  }

  getFilePath(): string {
    return this.filePath;
  }

  abstract canExtract(archiveEntry: ArchiveEntry<this>): boolean;

  /**
   * @returns true if entry paths are dictated by the contents of the archive, false if Igir
   * generates the entry paths
   */
  abstract hasMeaningfulEntryPaths(): boolean;

  abstract getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
    shouldForceChecksumCalculation?: boolean,
  ): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile(
    location: ArchiveEntryLocation,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void>;

  /**
   * Extract an entry from the archive to a temporary file, invoke the callback with that file's
   * path, then clean up the file.
   */
  async extractEntryToTempFile<T>(
    location: ArchiveEntryLocation,
    callback: (tempFile: string) => T | Promise<T>,
  ): Promise<T> {
    const tempFile = await FsUtil.mktemp(
      path.join(
        Temp.getTempDir(),
        FsUtil.makeLegal(path.basename(location.entryPath) || path.parse(this.getFilePath()).name),
      ),
    );

    const tempDir = path.dirname(tempFile);
    if (!(await FsUtil.exists(tempDir))) {
      await FsUtil.mkdir(tempDir, { recursive: true });
    }

    try {
      await this.extractEntryToFile(location, tempFile);
      return await callback(tempFile);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  }

  /**
   * Most archive libraries don't provide a way to read a specific entry's stream, extract the entry
   * to a temp file and then create a stream by default.
   *
   * The stream is bounded by the {@link start} and {@link end} byte offsets (both inclusive).
   */
  async extractEntryToStream<T>(
    location: ArchiveEntryLocation,
    callback: (readable: Readable) => Promise<T> | T,
    start = 0,
    end?: number,
  ): Promise<T> {
    return await this.extractEntryToTempFile(
      location,
      async (tempFile) => await File.createStreamFromFile(tempFile, callback, start, end),
    );
  }

  /**
   * Pick the chunk size to read and decompress an entry's {@link start} to {@link end} byte range
   * (both inclusive) with. A short range, such as a header probe, gets a smaller chunk size so it
   * doesn't decompress far past its end.
   * @returns the chunk size, in bytes
   */
  protected static getStreamChunkSize(start: number, end?: number): number {
    if (end === undefined) {
      return Defaults.FILE_READING_CHUNK_SIZE;
    }

    return Math.min(
      Defaults.FILE_READING_CHUNK_SIZE,
      Math.max(
        this.MIN_STREAM_CHUNK_SIZE,
        // The 4x here is a guess at how much a highly-compressible file might be compressed
        4 * (end - start + 1),
      ),
    );
  }

  /**
   * Invoke the callback with the {@link start} to {@link end} byte range (both inclusive) of a
   * forward-only {@link source} stream, then tear the stream down. Reaching {@link end} stops the
   * source early, so it doesn't decompress bytes that would be thrown away.
   */
  protected static async pipelineRange<T>(
    source: Readable,
    callback: (readable: Readable) => Promise<T> | T,
    start: number,
    end?: number,
  ): Promise<T> {
    const limitedCallback =
      end === undefined
        ? callback
        : async (readable: Readable): Promise<T> =>
            await StreamUtil.pipelineSafe(
              readable,
              new LimitBytesTransform(Math.max(0, end - start + 1)),
              callback,
            );
    return await StreamUtil.pipelineSafe(
      source,
      start > 0 ? new SkipBytesTransform(start) : undefined,
      limitedCallback,
    );
  }

  withFilePath(filePath: string): Archive {
    if (filePath === this.filePath) {
      return this;
    }
    return this.new(filePath);
  }
}
