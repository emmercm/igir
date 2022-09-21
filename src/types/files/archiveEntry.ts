import fs, { promises as fsPromises } from 'fs';
import { Readable } from 'stream';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from '../archives/archive.js';
import File from './file.js';
import FileHeader from './fileHeader.js';

export default class ArchiveEntry extends File {
  private readonly archive: Archive;

  private readonly entryPath: string;

  constructor(
    archive: Archive,
    entryPath: string,
    size: number,
    crc?: string,
    fileHeader?: FileHeader,
  ) {
    super(archive.getFilePath(), size, crc, fileHeader);
    this.archive = archive;
    this.entryPath = entryPath;
  }

  getExtractedFilePath(): string {
    return this.entryPath;
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extractToFile<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      return await this.archive.extractEntryToFile(this, tempDir, callback);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }

  async extractToStream<T>(callback: (stream: Readable) => (T | Promise<T>)): Promise<T> {
    // Don't extract to memory if this archive entry size is too large
    if (this.getSize() > Constants.MAX_STREAM_EXTRACTION_SIZE) {
      return this.extractToFile(async (localFile) => {
        const stream = fs.createReadStream(localFile);
        const result = await callback(stream);
        stream.destroy();
        return result;
      });
    }

    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      return await this.archive.extractEntryToStream(this, tempDir, callback);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    return new ArchiveEntry(
      this.archive,
      this.entryPath,
      this.getSize(),
      await this.getCrc32(),
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
