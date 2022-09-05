import path from 'path';

import File from './file.js';
import Rar from './rar.js';
import SevenZip from './sevenZip.js';
import Zip from './zip.js';

export default abstract class Archive extends File {
  private readonly archiveEntryPath?: string;

  protected constructor(filePath: string, archiveEntryPath?: string, crc?: string) {
    super(filePath, crc);
    this.archiveEntryPath = archiveEntryPath;
  }

  static from(filePath: string): Archive {
    if (Zip.SUPPORTED_EXTENSIONS.indexOf(path.extname(filePath)) !== -1) {
      return new Zip(filePath);
    } if (Rar.SUPPORTED_EXTENSIONS.indexOf(path.extname(filePath)) !== -1) {
      return new Rar(filePath);
    } if (SevenZip.SUPPORTED_EXTENSIONS.indexOf(path.extname(filePath)) !== -1) {
      return new SevenZip(filePath);
    }
    throw new Error(`Unknown archive type: ${filePath}`);
  }

  static isArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_EXTENSIONS,
      ...Rar.SUPPORTED_EXTENSIONS,
      ...SevenZip.SUPPORTED_EXTENSIONS,
    ].indexOf(path.extname(filePath)) !== -1;
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
