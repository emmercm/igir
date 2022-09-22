import fs from 'fs';
import { Readable } from 'stream';

import ArchiveEntry from '../files/archiveEntry.js';

export default abstract class Archive {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(): Promise<ArchiveEntry<Archive>[]>;

  abstract extractEntryToFile<T>(
    archiveEntry: ArchiveEntry<Archive>,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T>;

  extractEntryToStream<T>(
    archiveEntry: ArchiveEntry<Archive>,
    tempDir: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    return this.extractEntryToFile(archiveEntry, tempDir, async (localFile) => {
      const stream = fs.createReadStream(localFile);
      const result = await callback(stream);
      stream.destroy();
      return result;
    });
  }
}
