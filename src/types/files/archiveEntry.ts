import Archive from './archive.js';
import File from './file.js';

export default class ArchiveEntry extends File {
  private readonly archive: Archive;

  private readonly entryPath: string;

  constructor(archive: Archive, entryPath: string, crc?: string) {
    super(archive.getFilePath(), crc);
    this.archive = archive;
    this.entryPath = entryPath;
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extract<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    return this.archive.extractEntry(this, callback);
  }

  async equals(other: File): Promise<boolean> {
    if (this === other) {
      return true;
    }
    if (!(other instanceof ArchiveEntry)) {
      return false;
    }
    if (!await super.equals(other)) {
      return false;
    }
    return this.getEntryPath() === other.getEntryPath();
  }
}
