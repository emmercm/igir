import path from 'node:path';
import { Readable } from 'node:stream';

import Temp from '../../../globals/temp.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import File from '../file.js';
import ArchiveEntry from './archiveEntry.js';

export default abstract class Archive {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath.replace(/[\\/]/g, path.sep);
  }

  protected abstract new(filePath: string): Archive;

  abstract getExtension(): string;

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void>;

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
    callback: (stream: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    return this.extractEntryToTempFile(entryPath, async (tempFile) =>
      File.createStreamFromFile(tempFile, callback, start),
    );
  }

  withFilePath(filePath: string): Archive {
    if (filePath === this.filePath) {
      return this;
    }

    const { base, ...parsedFilePath } = path.parse(this.getFilePath());

    const newNameMatch = filePath.match(/^(.+[\\/])?(.+?[^.])((\.[a-zA-Z][a-zA-Z0-9]*)*)$/);
    parsedFilePath.name = newNameMatch !== null ? newNameMatch[2] : '';

    const oldExtMatch = this.getFilePath().match(
      /^(.+[\\/])?(.+?[^.])((\.[a-zA-Z][a-zA-Z0-9]*)*)$/,
    );
    parsedFilePath.ext = oldExtMatch !== null ? oldExtMatch[3] : '';

    return this.new(path.format(parsedFilePath));
  }
}
