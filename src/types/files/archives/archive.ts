import path from 'node:path';
import type { Readable } from 'node:stream';

import Temp from '../../../globals/temp.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import type { FsReadCallback } from '../../../polyfill/fsReadTransform.js';
import File from '../file.js';
import type ArchiveEntry from './archiveEntry.js';

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
  ): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void>;

  async extractEntryToTempFile<T>(
    entryPath: string,
    callback: (tempFile: string) => T | Promise<T>,
  ): Promise<T> {
    const tempFile = await FsPoly.mktemp(
      path.join(
        Temp.getTempDir(),
        FsPoly.makeLegal(path.basename(entryPath) || path.parse(this.getFilePath()).name),
      ),
    );

    const tempDir = path.dirname(tempFile);
    if (!(await FsPoly.exists(tempDir))) {
      await FsPoly.mkdir(tempDir, { recursive: true });
    }

    try {
      await this.extractEntryToFile(entryPath, tempFile);
      return await callback(tempFile);
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  }

  /**
   * Most archive libraries don't provide a way to read a specific entry's stream, extract the entry
   * to a temp file and then create a stream by default.
   */
  async extractEntryToStream<T>(
    entryPath: string,
    callback: (readable: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    return await this.extractEntryToTempFile(
      entryPath,
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
