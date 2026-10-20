import path from 'node:path';
import type { Readable } from 'node:stream';

import Temp from '../../../globals/temp.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import SkipBytesTransform from '../../../streams/skipBytesTransform.js';
import BufferUtil from '../../../utils/bufferUtil.js';
import FsUtil from '../../../utils/fsUtil.js';
import PathUtil from '../../../utils/pathUtil.js';
import StreamUtil from '../../../utils/streamUtil.js';
import File from '../file.js';
import type ArchiveEntry from './archiveEntry.js';

/**
 * A reference to a {@link ArchiveEntry} in a {@link Archive}, with enough information to extract
 * that entry. This is required to prevent a circular dependency between those two classes.
 */
export interface ArchiveEntryRef {
  readonly entryPath: string;
  /**
   * The entry's position in the archive's own item table, as the archive itself orders it.
   */
  readonly entryIndex?: number;
  /**
   * The entry's uncompressed size in bytes, if known.
   */
  readonly size?: number;
}

/**
 * Base class for an archive file format, providing entry enumeration and extraction.
 */
export default abstract class Archive {
  // A reasonable minimum chunk size, but still above zlib's minimum of 64 bytes
  private static readonly MIN_STREAM_CHUNK_SIZE = 4 * 1024;

  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = PathUtil.resolve(filePath);
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
    entryRef: ArchiveEntryRef,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void>;

  /**
   * Extract an entry from the archive to a temporary file, invoke the callback with that file's
   * path, then clean up the file.
   */
  async extractEntryToTempFile<T>(
    entryRef: ArchiveEntryRef,
    callback: (tempFile: string) => T | Promise<T>,
  ): Promise<T> {
    const tempFile = await FsUtil.mktemp(
      path.join(
        Temp.getTempDir(),
        FsUtil.makeLegal(path.basename(entryRef.entryPath) || path.parse(this.getFilePath()).name),
      ),
    );

    const tempDir = path.dirname(tempFile);
    if (!(await FsUtil.exists(tempDir))) {
      await FsUtil.mkdir(tempDir, { recursive: true });
    }

    try {
      await this.extractEntryToFile(entryRef, tempFile);
      return await callback(tempFile);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  }

  /**
   * Invoke the callback with a readable stream of the entry's bytes, from the {@link start} byte
   * offset to the end of the entry.
   */
  async extractEntryToStream<T>(
    entryRef: ArchiveEntryRef,
    callback: (readable: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    return await this.streamEntry(
      entryRef,
      async (source) =>
        await StreamUtil.pipelineSafe(
          source,
          start > 0 ? new SkipBytesTransform(start) : undefined,
          callback,
        ),
    );
  }

  /**
   * Read the entry's first {@link byteCount} bytes, without decompressing much further than that.
   * @returns those bytes, or fewer if the entry is shorter
   */
  async readEntryFirstBytes(entryRef: ArchiveEntryRef, byteCount: number): Promise<Buffer> {
    if (byteCount <= 0) {
      return Buffer.alloc(0);
    }
    return await this.streamEntry(
      entryRef,
      async (source) =>
        await StreamUtil.pipelineSafe(
          source,
          undefined,
          async (readable) => await BufferUtil.fromReadableFirstBytes(readable, byteCount),
        ),
      byteCount,
    );
  }

  /**
   * Invoke the callback with a forward-only stream of the entry's bytes from its first byte. When
   * the caller only reads the leading {@link byteCount} bytes, the stream is read in chunks sized
   * for that, but it isn't bounded by it. The callback tears the stream down.
   *
   * Most archive libraries don't provide a way to read a specific entry's stream, extract the entry
   * to a temp file and then create a stream by default.
   */
  protected async streamEntry<T>(
    entryRef: ArchiveEntryRef,
    callback: (source: Readable) => Promise<T>,
    byteCount?: number,
  ): Promise<T> {
    return await this.extractEntryToTempFile(
      entryRef,
      async (tempFile) =>
        await File.streamFilePath(
          tempFile,
          callback,
          entryRef.size,
          0,
          // The temp file can be bounded for free
          byteCount === undefined ? undefined : byteCount - 1,
        ),
    );
  }

  /**
   * Pick the chunk size to read and decompress an entry of {@link size} bytes with. A caller that
   * only reads the entry's leading {@link byteCount} bytes, such as a header probe, gets a smaller
   * chunk size so it doesn't decompress far past them.
   * @returns the chunk size, in bytes
   */
  protected static getStreamChunkSize(size?: number, byteCount?: number): number {
    const chunkSize = StreamUtil.getChunkSize(0, undefined, size);
    if (byteCount === undefined) {
      return chunkSize;
    }

    return Math.min(
      chunkSize,
      Math.max(
        this.MIN_STREAM_CHUNK_SIZE,
        // The 4x here is a guess at how much a highly-compressible file might be compressed
        4 * byteCount,
      ),
    );
  }

  withFilePath(filePath: string): Archive {
    if (filePath === this.filePath) {
      return this;
    }
    return this.new(filePath);
  }
}
