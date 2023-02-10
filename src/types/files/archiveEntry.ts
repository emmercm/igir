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
    symlinkSource: string | undefined,
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
      symlinkSource,
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
    let finalSymlinkSource;
    if (await fsPoly.exists(archive.getFilePath())) {
      if (await fsPoly.isSymlink(archive.getFilePath())) {
        finalSymlinkSource = await fsPoly.readlink(archive.getFilePath());
      }
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
      finalSymlinkSource,
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

  async extractToFile(
    extractedFilePath: string,
  ): Promise<void> {
    return ArchiveEntry.extractEntryToFile(
      this.getArchive(),
      this.getEntryPath(),
      extractedFilePath,
    );
  }

  private static async extractEntryToFile(
    archive: Archive,
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
    return archive.extractEntryToFile(entryPath, extractedFilePath);
  }

  async extractToTempFile<T>(
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
    start = 0,
  ): Promise<T> {
    // Don't extract to memory if this archive entry size is too large, or if we need to manipulate
    // the stream start point
    if (this.getSize() > Constants.MAX_MEMORY_FILE_SIZE || start > 0) {
      return this.extractToTempFile(
        async (tempFile) => File.createStreamFromFile(tempFile, start, callback),
      );
    }

    return this.archive.extractEntryToStream(this.getEntryPath(), callback);
  }

  async withArchiveFileName(fileNameWithoutExt: string): Promise<ArchiveEntry<Archive>> {
    return ArchiveEntry.entryOf(
      this.getArchive().withFileName(fileNameWithoutExt),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withEntryPath(entryPath: string): Promise<ArchiveEntry<A>> {
    return ArchiveEntry.entryOf(
      this.getArchive(),
      entryPath,
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withFileHeader(fileHeader: FileHeader): Promise<ArchiveEntry<A>> {
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

  async withPatch(patch: Patch): Promise<ArchiveEntry<A>> {
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
    if (this.getSymlinkSource()) {
      return `${this.getFilePath()}|${this.getEntryPath()} -> ${this.getSymlinkSource()}|${this.getEntryPath()}`;
    }
    return `${this.getFilePath()}|${this.getEntryPath()}`;
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
