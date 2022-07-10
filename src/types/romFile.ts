import crc32 from 'crc/crc32';
import fs from 'fs';

export default class ROMFile {
  private readonly filePath!: string;

  private readonly entryPath?: string;

  private readonly crc!: string;

  constructor(filePath: string, entryPath?: string, crc?: string) {
    this.filePath = filePath;
    this.entryPath = entryPath;
    this.crc = (crc || crc32(fs.readFileSync(filePath)).toString(16)).padStart(8, '0');
  }

  getFilePath(): string {
    return this.filePath;
  }

  getEntryPath(): string | undefined {
    return this.entryPath;
  }

  getCrc(): string {
    return this.crc;
  }

  equals(other: ROMFile): boolean {
    if (this === other) {
      return true;
    }
    if (!other || typeof this !== typeof other) {
      return false;
    }
    return this.getFilePath() === other.getFilePath()
        && this.getEntryPath() === other.getEntryPath()
        && this.getCrc() === other.getCrc();
  }
}
