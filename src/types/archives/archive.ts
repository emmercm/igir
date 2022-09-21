import ArchiveEntry from '../files/archiveEntry.js';

export default abstract class Archive {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  getFilePath(): string {
    return this.filePath;
  }

  abstract getArchiveEntries(): Promise<ArchiveEntry[]>;

  abstract extractEntry<T>(
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T>;
}
