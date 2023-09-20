import path from 'node:path';
import { Readable } from 'node:stream';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import Patch from '../../patches/patch.js';
import File, { FileProps } from '../file.js';
import ROMHeader from '../romHeader.js';
import Archive from './archive.js';

interface ArchiveEntryProps<A> extends FileProps {
  readonly archive: A;
  readonly entryPath: string;
}

export default class ArchiveEntry<A extends Archive> extends File implements ArchiveEntryProps<A> {
  readonly archive: A;

  readonly entryPath: string;

  protected constructor(archiveEntryProps: ArchiveEntryProps<A>) {
    super(archiveEntryProps);
    this.archive = archiveEntryProps.archive;
    this.entryPath = path.normalize(archiveEntryProps.entryPath);
  }

  static async entryOf<A extends Archive>(
    archive: A,
    entryPath: string,
    size: number,
    crc: string,
    fileHeader?: ROMHeader,
    patch?: Patch,
  ): Promise<ArchiveEntry<A>> {
    let finalCrcWithoutHeader;
    let finalSymlinkSource;
    if (await fsPoly.exists(archive.getFilePath())) {
      if (await fsPoly.isSymlink(archive.getFilePath())) {
        finalSymlinkSource = await fsPoly.readlink(archive.getFilePath());
      }
      if (fileHeader) {
        finalCrcWithoutHeader = finalCrcWithoutHeader ?? await this.extractEntryToTempFile(
          archive,
          entryPath,
          async (localFile) => this.calculateCrc32(localFile, fileHeader),
        );
      }
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader ?? crc;

    return new ArchiveEntry<A>({
      filePath: archive.getFilePath(),
      size,
      crc32: crc,
      crc32WithoutHeader: finalCrcWithoutHeader,
      symlinkSource: finalSymlinkSource,
      fileHeader,
      patch,
      archive,
      entryPath,
    });
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

  withFilePath(filePath: string): ArchiveEntry<Archive> {
    return new ArchiveEntry({
      ...this,
      archive: this.getArchive().withFilePath(filePath),
    });
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

  async withFileHeader(fileHeader: ROMHeader): Promise<ArchiveEntry<A>> {
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

  withPatch(patch: Patch): ArchiveEntry<A> {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return new ArchiveEntry({
      ...this,
      fileHeader: undefined, // don't allow a file header
      patch,
    });
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
