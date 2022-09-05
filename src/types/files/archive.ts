import path from 'path';

import File from './file.js';

export default abstract class Archive extends File {
  private readonly archiveEntryPath?: string;

  constructor(filePath: string, archiveEntryPath?: string, crc?: string) {
    super(filePath, crc);
    this.archiveEntryPath = archiveEntryPath;
  }

  getArchiveEntryPath(): string | undefined {
    return this.archiveEntryPath;
  }

  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  abstract listAllEntryPaths(): Promise<Archive[]>;

  abstract extract(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void>;

  toString(): string {
    return `${this.getFilePath()}|${this.archiveEntryPath}`;
  }

  async equals(other: Archive): Promise<boolean> {
    if (this === other) {
      return true;
    }
    return this.getFilePath() === other.getFilePath()
            && this.getArchiveEntryPath() === other.getArchiveEntryPath()
            && await this.getCrc32() === await other.getCrc32();
  }
}
