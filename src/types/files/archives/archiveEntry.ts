import path from 'node:path';
import { Readable } from 'node:stream';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import Patch from '../../patches/patch.js';
import File, { FileProps } from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
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
    size?: number,
    checksums?: ChecksumProps,
    checksumBitmask: number = ChecksumBitmask.CRC32,
    fileHeader?: ROMHeader,
    patch?: Patch,
  ): Promise<ArchiveEntry<A>> {
    let finalSize = size;
    let finalCrcWithHeader = checksums?.crc32;
    let finalCrcWithoutHeader;
    let finalMd5WithHeader = checksums?.md5;
    let finalMd5WithoutHeader;
    let finalSha1WithHeader = checksums?.sha1;
    let finalSha1WithoutHeader;
    let finalSymlinkSource;

    if (await fsPoly.exists(archive.getFilePath())) {
      // Calculate size
      finalSize = finalSize ?? 0;

      // Calculate checksums
      if ((!finalCrcWithHeader && (checksumBitmask & ChecksumBitmask.CRC32))
        || (!finalMd5WithHeader && (checksumBitmask & ChecksumBitmask.MD5))
        || (!finalSha1WithHeader && (checksumBitmask & ChecksumBitmask.SHA1))
      ) {
        const headeredChecksums = await this.calculateEntryChecksums(
          archive,
          entryPath,
          checksumBitmask,
        );
        finalCrcWithHeader = headeredChecksums.crc32 ?? finalCrcWithHeader;
        finalMd5WithHeader = headeredChecksums.md5 ?? finalMd5WithHeader;
        finalSha1WithHeader = headeredChecksums.sha1 ?? finalSha1WithHeader;
      }
      if (fileHeader && checksumBitmask) {
        const unheaderedChecksums = await this.calculateEntryChecksums(
          archive,
          entryPath,
          checksumBitmask,
          fileHeader,
        );
        finalCrcWithoutHeader = unheaderedChecksums.crc32;
        finalMd5WithoutHeader = unheaderedChecksums.md5;
        finalSha1WithoutHeader = unheaderedChecksums.sha1;
      }

      if (await fsPoly.isSymlink(archive.getFilePath())) {
        finalSymlinkSource = await fsPoly.readlink(archive.getFilePath());
      }
    } else {
      finalSize = finalSize ?? 0;
      finalCrcWithHeader = finalCrcWithHeader ?? '';
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader ?? finalCrcWithHeader;
    finalMd5WithoutHeader = finalMd5WithoutHeader ?? finalMd5WithHeader;
    finalSha1WithoutHeader = finalSha1WithoutHeader ?? finalSha1WithHeader;

    return new ArchiveEntry<A>({
      filePath: archive.getFilePath(),
      size: finalSize,
      crc32: finalCrcWithHeader,
      crc32WithoutHeader: finalCrcWithoutHeader,
      md5: finalMd5WithHeader,
      md5WithoutHeader: finalMd5WithoutHeader,
      sha1: finalSha1WithHeader,
      sha1WithoutHeader: finalSha1WithoutHeader,
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

  private static async calculateEntryChecksums(
    archive: Archive,
    entryPath: string,
    checksumBitmask: number,
    fileHeader?: ROMHeader,
  ): Promise<ChecksumProps> {
    return archive.extractEntryToStream(
      entryPath,
      async (stream) => FileChecksums.hashStream(stream, checksumBitmask),
      fileHeader?.getDataOffsetBytes() ?? 0,
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

  withEntryPath(entryPath: string): ArchiveEntry<A> {
    return new ArchiveEntry({
      ...this,
      entryPath,
    });
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
      this,
      this.getChecksumBitmask(),
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
