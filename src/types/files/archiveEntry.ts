import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { Readable } from 'stream';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from '../archives/archive.js';
import File from './file.js';
import FileHeader from './fileHeader.js';

export default class ArchiveEntry<A extends Archive> extends File {
  private readonly archive: A;

  private readonly entryPath: string;

  protected constructor(
    /** {@link File} */
    filePath: string,
    size: number,
    crc: string,
    crc32WithoutHeader: string,
    fileHeader: FileHeader | undefined,
    /** {@link ArchiveEntry} */
    archive: A,
    entryPath: string,
  ) {
    super(
      filePath,
      size,
      crc,
      crc32WithoutHeader,
      fileHeader,
    );
    this.archive = archive;
    this.entryPath = path.normalize(entryPath);
  }

  static async entryOf<A extends Archive>(
    archive: A,
    entryPath: string,
    size: number,
    crc: string,
    fileHeader?: FileHeader,
  ): Promise<ArchiveEntry<A>> {
    let finalCrcWithoutHeader = crc;
    if (fileHeader) {
      finalCrcWithoutHeader = await this.extractEntryToFile(
        archive,
        entryPath,
        async (localFile) => this.calculateCrc32(localFile, fileHeader),
      );
    }

    return new ArchiveEntry<A>(
      archive.getFilePath(),
      size,
      crc,
      finalCrcWithoutHeader,
      fileHeader,
      archive,
      entryPath,
    );
  }

  getArchive(): A {
    return this.archive;
  }

  getExtractedFilePath(): string {
    return this.entryPath;
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extractToFile<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    return ArchiveEntry.extractEntryToFile(this.getArchive(), this.getEntryPath(), callback);
  }

  private static async extractEntryToFile<T>(
    archive: Archive,
    entryPath: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      return await archive.extractEntryToFile(entryPath, tempDir, callback);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }

  async extractToStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    removeHeader = false,
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.dataOffsetBytes || 0
      : 0;

    // Don't extract to memory if this archive entry size is too large, or if we need to manipulate
    // the stream start point
    if (this.getSize() > Constants.MAX_STREAM_EXTRACTION_SIZE || start > 0) {
      return this.extractToFile(async (localFile) => {
        const stream = fs.createReadStream(localFile, { start });
        const result = await callback(stream);
        stream.destroy();
        return result;
      });
    }

    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    try {
      return await this.archive.extractEntryToStream(this.getEntryPath(), tempDir, callback);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    // Make sure the file actually has the header magic string
    const hasHeader = await this.extractToStream(
      async (stream) => fileHeader.fileHasHeader(stream),
    );
    if (!hasHeader) {
      return this;
    }

    return ArchiveEntry.entryOf(
      this.getArchive(),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      fileHeader,
    );
  }

  toString(): string {
    return `${this.getFilePath()}|${this.entryPath}`;
  }

  equals(other: File): boolean {
    if (this === other) {
      return true;
    }
    if (!(other instanceof ArchiveEntry)) {
      return false;
    }
    if (!super.equals(other)) {
      return false;
    }
    return this.getEntryPath() === other.getEntryPath();
  }
}
