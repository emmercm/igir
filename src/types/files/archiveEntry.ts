import path from 'path';
import { Readable } from 'stream';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from '../archives/archive.js';
import Patch from '../patches/patch.js';
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
    patch: Patch | undefined,
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
      patch,
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
    patch?: Patch,
  ): Promise<ArchiveEntry<A>> {
    let finalCrcWithoutHeader;
    if (await fsPoly.exists(archive.getFilePath())) {
      if (fileHeader) {
        finalCrcWithoutHeader = finalCrcWithoutHeader || await this.extractEntryToTempFile(
          archive,
          entryPath,
          async (localFile) => this.calculateCrc32(localFile, fileHeader),
        );
      }
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader || crc;

    return new ArchiveEntry<A>(
      archive.getFilePath(),
      size,
      crc,
      finalCrcWithoutHeader,
      fileHeader,
      patch,
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

  async copyToFile<T>(
    extractedFilePath: string,
    callback: (extractedFilePath: string) => (T | Promise<T>),
  ): Promise<T> {
    return ArchiveEntry.extractEntryToFile(
      this.getArchive(),
      this.getEntryPath(),
      extractedFilePath,
      callback,
    );
  }

  private static async extractEntryToFile<T>(
    archive: Archive,
    entryPath: string,
    extractedFilePath: string,
    callback: (extractedFilePath: string) => (Promise<T> | T),
  ): Promise<T> {
    return archive.extractEntryToFile(entryPath, extractedFilePath, callback);
  }

  async copyToTempFile<T>(
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    return ArchiveEntry.extractEntryToTempFile(this.getArchive(), this.getEntryPath(), callback);
  }

  private static async extractEntryToTempFile<T>(
    archive: Archive,
    entryPath: string,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    return archive.extractEntryToTempFile(entryPath, callback);
  }

  async createReadStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    removeHeader = false,
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() || 0
      : 0;

    // Apply the patch if there is one
    if (this.getPatch()) {
      const patch = this.getPatch() as Patch;
      return patch.applyToTempFile(this, async (tempFile) => File
        .createStreamFromFile(tempFile, start, callback));
    }

    // Don't extract to memory if this archive entry size is too large, or if we need to manipulate
    // the stream start point
    if (this.getSize() > Constants.MAX_MEMORY_FILE_SIZE || start > 0) {
      return this.copyToTempFile(
        async (tempFile) => File.createStreamFromFile(tempFile, start, callback),
      );
    }

    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'xstream'));
    try {
      return await this.archive.extractEntryToStream(this.getEntryPath(), callback);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    // Make sure the file actually has the right file signature
    const hasHeader = await this.createReadStream(
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
      undefined, // don't allow a patch
    );
  }

  async withPatch(patch: Patch): Promise<File> {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return ArchiveEntry.entryOf(
      this.getArchive(),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      undefined, // don't allow a file header
      patch,
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
