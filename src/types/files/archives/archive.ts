import path from 'node:path';
import { Readable } from 'node:stream';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import File from '../file.js';
import { ChecksumBitmask } from '../fileChecksums.js';
import ArchiveEntry from './archiveEntry.js';

export default abstract class Archive {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  protected abstract new(filePath: string): Archive;

  /**
   * Forget that the current file is an archive and treat it as a raw file, such that we can
   *  compute its size and CRC.
   */
  async asRawFile(): Promise<File> {
    // TODO(cemmer): calculate MD5 and SHA1 for testing purposes?
    return File.fileOf(this.getFilePath());
  }

  async asRawFileWithoutCrc(): Promise<File> {
    return File.fileOf(this.getFilePath(), undefined, undefined, ChecksumBitmask.NONE);
  }

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void>;

  async extractEntryToTempFile<T>(
    entryPath: string,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    await using disposableStack = new AsyncDisposableStack();

    const tempFile = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(entryPath),
    ));
    disposableStack.defer(async () => fsPoly.rm(tempFile, { force: true }));

    await this.extractEntryToFile(entryPath, tempFile);
    return callback(tempFile);
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
      async (tempFile) => File.createStreamFromFile(tempFile, start, callback),
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
