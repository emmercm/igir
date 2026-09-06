import path from 'node:path';
import type { Readable } from 'node:stream';

import Temp from '../../../globals/temp.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import FsUtil from '../../../utils/fsUtil.js';
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
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  protected abstract new(filePath: string): Archive;

  abstract getExtension(): string;

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
   */
  async extractEntryToStream<T>(
    location: ArchiveEntryLocation,
    callback: (readable: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    return await this.extractEntryToTempFile(
      location,
      async (tempFile) => await File.createStreamFromFile(tempFile, callback, start),
    );
  }

  withFilePath(filePath: string): Archive {
    if (filePath === this.filePath) {
      return this;
    }
    return this.new(filePath);
  }
}
