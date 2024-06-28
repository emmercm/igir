import path from 'node:path';
import { Readable } from 'node:stream';

import Defaults from '../../../constants/defaults.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import File from '../file.js';
import ArchiveEntry from './archiveEntry.js';

export default abstract class Archive {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  protected abstract new(filePath: string): Archive;

  abstract getExtension(): string;

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]>;

  abstract extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void>;

  async extractEntryToTempFile<T>(
    entryPath: string,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempFile = await fsPoly.mktemp(path.join(
      Defaults.GLOBAL_TEMP_DIR,
      path.basename(entryPath),
    ));

    try {
      await this.extractEntryToFile(entryPath, tempFile);
      return await callback(tempFile);
    } finally {
      await fsPoly.rm(tempFile, { force: true });
    }
  }

  /**
   * Most archive libraries don't provide a way to read a specific entry's stream, extract the entry
   * to a temp file and then create a stream by default.
   */
  async extractEntryToStream<T>(
    entryPath: string,
    callback: (stream: Readable) => (Promise<T> | T),
    start = 0,
  ): Promise<T> {
    return this.extractEntryToTempFile(
      entryPath,
      async (tempFile) => File.createStreamFromFile(tempFile, callback, start),
    );
  }

  withFilePath(filePath: string): Archive {
    const { base, ...parsedFilePath } = path.parse(this.getFilePath());
    parsedFilePath.name = path.parse(filePath).name;

    const extMatch = this.getFilePath().match(/[^.]+((\.[a-zA-Z0-9]+)+)$/);
    parsedFilePath.ext = extMatch !== null ? extMatch[1] : '';

    const newFilePath = path.format(parsedFilePath);
    return this.new(newFilePath);
  }
}
