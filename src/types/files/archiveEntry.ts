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

  async extract(callback: (localFile: string) => (void | Promise<void>)): Promise<void> {
    await this.archive.extractEntry(this, callback);
  }
}
