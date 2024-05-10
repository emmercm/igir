import path from 'node:path';
import { Readable } from 'node:stream';

import {
  Exclude, Expose, instanceToPlain, plainToClassFromExist,
} from 'class-transformer';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import Patch from '../../patches/patch.js';
import File, { FileProps } from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
import ROMHeader from '../romHeader.js';
import Archive from './archive.js';

export interface ArchiveEntryProps<A extends Archive> extends Omit<FileProps, 'filePath'> {
  readonly archive: A;
  readonly entryPath: string;
}

@Exclude()
export default class ArchiveEntry<A extends Archive> extends File implements ArchiveEntryProps<A> {
  readonly archive: A;

  @Expose()
  readonly entryPath: string;

  protected constructor(archiveEntryProps: ArchiveEntryProps<A>) {
    super({
      ...archiveEntryProps,
      filePath: archiveEntryProps.archive.getFilePath(),
    });
    this.archive = archiveEntryProps.archive;
    this.entryPath = path.normalize(archiveEntryProps.entryPath);
  }

  static async entryOf<A extends Archive>(
    archiveEntryProps: ArchiveEntryProps<A>,
    checksumBitmask: number = ChecksumBitmask.CRC32,
  ): Promise<ArchiveEntry<A>> {
    let finalSize = archiveEntryProps.size;
    let finalCrcWithHeader = archiveEntryProps.crc32;
    let finalCrcWithoutHeader = archiveEntryProps.fileHeader
      ? archiveEntryProps.crc32WithoutHeader
      : archiveEntryProps.crc32;
    let finalMd5WithHeader = archiveEntryProps.md5;
    let finalMd5WithoutHeader = archiveEntryProps.fileHeader
      ? archiveEntryProps.md5WithoutHeader
      : archiveEntryProps.md5;
    let finalSha1WithHeader = archiveEntryProps.sha1;
    let finalSha1WithoutHeader = archiveEntryProps.fileHeader
      ? archiveEntryProps.sha1WithoutHeader
      : archiveEntryProps.sha1;
    let finalSha256WithHeader = archiveEntryProps.sha256;
    let finalSha256WithoutHeader = archiveEntryProps.fileHeader
      ? archiveEntryProps.sha256WithoutHeader
      : archiveEntryProps.sha256;
    let finalSymlinkSource = archiveEntryProps.symlinkSource;

    if (await fsPoly.exists(archiveEntryProps.archive.getFilePath())) {
      // Calculate size
      finalSize = finalSize ?? 0;

      // Calculate checksums
      if ((!finalCrcWithHeader && (checksumBitmask & ChecksumBitmask.CRC32))
        || (!finalMd5WithHeader && (checksumBitmask & ChecksumBitmask.MD5))
        || (!finalSha1WithHeader && (checksumBitmask & ChecksumBitmask.SHA1))
        || (!finalSha256WithHeader && (checksumBitmask & ChecksumBitmask.SHA256))
      ) {
        // If any additional checksum needs to be calculated, then prefer those calculated ones
        // over any that were supplied in {@link archiveEntryProps} that probably came from the
        // archive's file table.
        const headeredChecksums = await this.calculateEntryChecksums(
          archiveEntryProps.archive,
          archiveEntryProps.entryPath,
          checksumBitmask,
        );
        finalCrcWithHeader = headeredChecksums.crc32 ?? finalCrcWithHeader;
        finalMd5WithHeader = headeredChecksums.md5 ?? finalMd5WithHeader;
        finalSha1WithHeader = headeredChecksums.sha1 ?? finalSha1WithHeader;
        finalSha256WithHeader = headeredChecksums.sha256 ?? finalSha256WithHeader;
      }
      if (archiveEntryProps.fileHeader && checksumBitmask) {
        const headerlessChecksums = await this.calculateEntryChecksums(
          archiveEntryProps.archive,
          archiveEntryProps.entryPath,
          checksumBitmask,
          archiveEntryProps.fileHeader,
        );
        finalCrcWithoutHeader = headerlessChecksums.crc32;
        finalMd5WithoutHeader = headerlessChecksums.md5;
        finalSha1WithoutHeader = headerlessChecksums.sha1;
        finalSha256WithoutHeader = headerlessChecksums.sha256;
      }

      if (await fsPoly.isSymlink(archiveEntryProps.archive.getFilePath())) {
        finalSymlinkSource = await fsPoly.readlink(archiveEntryProps.archive.getFilePath());
      }
    } else {
      finalSize = finalSize ?? 0;
      finalCrcWithHeader = finalCrcWithHeader ?? '';
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader ?? finalCrcWithHeader;
    finalMd5WithoutHeader = finalMd5WithoutHeader ?? finalMd5WithHeader;
    finalSha1WithoutHeader = finalSha1WithoutHeader ?? finalSha1WithHeader;
    finalSha256WithoutHeader = finalSha256WithoutHeader ?? finalSha256WithHeader;

    return new ArchiveEntry<A>({
      size: finalSize,
      crc32: finalCrcWithHeader,
      crc32WithoutHeader: finalCrcWithoutHeader,
      md5: finalMd5WithHeader,
      md5WithoutHeader: finalMd5WithoutHeader,
      sha1: finalSha1WithHeader,
      sha1WithoutHeader: finalSha1WithoutHeader,
      sha256: finalSha256WithHeader,
      sha256WithoutHeader: finalSha256WithoutHeader,
      symlinkSource: finalSymlinkSource,
      fileHeader: archiveEntryProps.fileHeader,
      patch: archiveEntryProps.patch,
      archive: archiveEntryProps.archive,
      entryPath: archiveEntryProps.entryPath,
    });
  }

  static async entryOfObject<A extends Archive>(
    archive: A,
    obj: ArchiveEntryProps<A>,
  ): Promise<ArchiveEntry<A>> {
    const deserialized = plainToClassFromExist(
      new ArchiveEntry({ archive, entryPath: '' }),
      obj,
      {
        enableImplicitConversion: true,
        excludeExtraneousValues: true,
      },
    );
    return this.entryOf({ ...deserialized, archive });
  }

  toEntryProps(): ArchiveEntryProps<A> {
    return instanceToPlain(this, {
      exposeUnsetFields: false,
    }) as ArchiveEntryProps<A>;
  }

  // Property getters

  getArchive(): A {
    return this.archive;
  }

  getExtractedFilePath(): string {
    // Note: {@link Chd} will stuff some extra metadata in the entry path, chop it out
    return this.entryPath.split('|')[0];
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
        async (tempFile) => File.createStreamFromFile(tempFile, callback, start),
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

    return ArchiveEntry.entryOf({
      ...this,
      fileHeader,
      patch: undefined, // don't allow a patch
    }, this.getChecksumBitmask());
  }

  withoutFileHeader(): ArchiveEntry<A> {
    return new ArchiveEntry({
      ...this,
      fileHeader: undefined,
      crc32WithoutHeader: this.getCrc32(),
      md5WithoutHeader: this.getMd5(),
      sha1WithoutHeader: this.getSha1(),
      sha256WithoutHeader: this.getSha256(),
    });
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
