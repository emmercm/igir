import path from 'path';
import { Readable } from 'stream';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import File from '../file.js';
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
    return File.fileOf(this.getFilePath());
  }

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void>;

  async extractEntryToTempFile<T>(
    entryPath: string,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempFile = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
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
  ): Promise<T> {
    return this.extractEntryToTempFile(
      entryPath,
      async (tempFile) => File.createStreamFromFile(tempFile, 0, callback),
    );
  }

  withFileName(fileNameWithoutExt: string): Archive {
    const { base, ...parsedFilePath } = path.parse(this.getFilePath());
    parsedFilePath.name = fileNameWithoutExt;

    const extMatch = this.getFilePath().match(/[^.]+((\.[a-zA-Z0-9]+)+)$/);
    parsedFilePath.ext = extMatch !== null ? extMatch[1] : '';

    const filePath = path.format(parsedFilePath);
    return this.new(filePath);
  }
}
