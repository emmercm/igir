import path from 'path';
import { Readable } from 'stream';

import ArchiveEntry from '../files/archiveEntry.js';
import File from '../files/file.js';

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

  abstract extractEntryToFile<T>(
    entryPath: string,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T>;

  async extractEntryToStream<T>(
    entryPath: string,
    tempDir: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    return this.extractEntryToFile(entryPath, tempDir, async (localFile) => File
      .createStreamFromFile(localFile, 0, callback));
  }

  withFileName(fileNameWithoutExt: string): Archive {
    const { base, ...parsedFilePath } = path.parse(this.getFilePath());
    parsedFilePath.name = fileNameWithoutExt;
    const filePath = path.format(parsedFilePath);

    return this.new(filePath);
  }
}
