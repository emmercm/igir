import { promises as fsPromises } from 'fs';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from '../archives/archive.js';
import File from './file.js';
import FileHeader from './fileHeader.js';

export default class ArchiveEntry extends File {
  private readonly archive: Archive;

  private readonly entryPath: string;

  constructor(archive: Archive, entryPath: string, crc?: string, fileHeader?: FileHeader) {
    super(archive.getFilePath(), crc, fileHeader);
    this.archive = archive;
    this.entryPath = entryPath;
  }

  getExtractedFilePath(): string {
    return this.entryPath;
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extract<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);

    try {
      return await this.archive.extractEntry(this, tempDir, callback);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }

  withFileHeader(fileHeader: FileHeader): File {
    return new ArchiveEntry(
      this.archive,
      this.entryPath,
      undefined, // the old CRC can't be used, a header will change it
      fileHeader,
    );
  }

  toString(): string {
    return `${this.getFilePath()}|${this.entryPath}`;
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
