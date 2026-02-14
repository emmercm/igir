import path from 'node:path';
import { Readable } from 'node:stream';

import { Exclude, Expose, instanceToPlain, plainToClassFromExist } from 'class-transformer';

import FsPoly from '../../../polyfill/fsPoly.js';
import { FsReadCallback } from '../../../polyfill/fsReadTransform.js';
import Patch from '../../patches/patch.js';
import File, { FileProps } from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
import ROMHeader from '../romHeader.js';
import ROMPadding from '../romPadding.js';
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
    this.entryPath = archiveEntryProps.entryPath.replaceAll(/[\\/]/g, path.sep);
  }

  static async entryOf<A extends Archive>(
    archiveEntryProps: ArchiveEntryProps<A>,
    checksumBitmask: number = ChecksumBitmask.NONE,
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

    if (await FsPoly.exists(archiveEntryProps.archive.getFilePath())) {
      // Calculate size
      finalSize = finalSize ?? 0;

      // Calculate checksums
      if (
        (!finalCrcWithHeader && checksumBitmask & ChecksumBitmask.CRC32) ||
        (!finalMd5WithHeader && checksumBitmask & ChecksumBitmask.MD5) ||
        (!finalSha1WithHeader && checksumBitmask & ChecksumBitmask.SHA1) ||
        (!finalSha256WithHeader && checksumBitmask & ChecksumBitmask.SHA256)
      ) {
        /**
         * If any additional checksum needs to be calculated, then prefer those calculated ones
         * over any that were supplied in {@link archiveEntryProps} that probably came from the
         * archive's file table.
         */
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

      if (await FsPoly.isSymlink(archiveEntryProps.archive.getFilePath())) {
        finalSymlinkSource = await FsPoly.readlink(archiveEntryProps.archive.getFilePath());
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
    const deserialized = plainToClassFromExist(new ArchiveEntry({ archive, entryPath: '' }), obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    return await this.entryOf({ ...deserialized, archive });
  }

  toEntryProps(): ArchiveEntryProps<A> {
    return instanceToPlain(this, {
      exposeUnsetFields: false,
    }) as ArchiveEntryProps<A>;
  }

  // Property getters

  /**
   * Note: we're using type `Archive` here instead of `A` because otherwise TypeScript v5.7 will
   * think this is an `any`:
   * <code>
   * (File instanceof ArchiveEntry).getArchive()
   * </code>
   */
  getArchive(): Archive {
    return this.archive;
  }

  getExtractedFilePath(): string {
    /**
     * Note: {@link Chd} will stuff some extra metadata in the entry path, chop it out
     */
    return this.entryPath.split('|')[0];
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extractToFile(extractedFilePath: string, callback?: FsReadCallback): Promise<void> {
    await ArchiveEntry.extractEntryToFile(
      this.getArchive(),
      this.getEntryPath(),
      extractedFilePath,
      callback,
    );
  }

  private static async calculateEntryChecksums(
    archive: Archive,
    entryPath: string,
    checksumBitmask: number,
    fileHeader?: ROMHeader,
  ): Promise<ChecksumProps> {
    return await archive.extractEntryToStream(
      entryPath,
      async (readable) => await FileChecksums.hashStream(readable, checksumBitmask),
      fileHeader?.getDataOffsetBytes() ?? 0,
    );
  }

  private static async extractEntryToFile(
    archive: Archive,
    entryPath: string,
    extractedFilePath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await archive.extractEntryToFile(entryPath, extractedFilePath, callback);
  }

  async extractToTempFile<T>(callback: (tempFile: string) => T | Promise<T>): Promise<T> {
    return await ArchiveEntry.extractEntryToTempFile(
      this.getArchive(),
      this.getEntryPath(),
      callback,
    );
  }

  private static async extractEntryToTempFile<T>(
    archive: Archive,
    entryPath: string,
    callback: (tempFile: string) => T | Promise<T>,
  ): Promise<T> {
    return await archive.extractEntryToTempFile(entryPath, callback);
  }

  async createReadStream<T>(callback: (stream: Readable) => T | Promise<T>, start = 0): Promise<T> {
    // Don't extract to memory if we need to manipulate the stream start point
    if (start > 0) {
      return await this.extractToTempFile(
        async (tempFile) => await File.createStreamFromFile(tempFile, callback, start),
      );
    }

    return await this.archive.extractEntryToStream(this.getEntryPath(), callback);
  }

  withProps(props: ArchiveEntryProps<A>): ArchiveEntry<A> {
    return new ArchiveEntry({
      ...this,
      ...props,
    });
  }

  withFilePath(filePath: string): ArchiveEntry<A> {
    if (this.getArchive().getFilePath() === filePath) {
      return this;
    }
    return new ArchiveEntry({
      ...this,
      archive: this.getArchive().withFilePath(filePath),
    }) as ArchiveEntry<A>;
  }

  withEntryPath(entryPath: string): ArchiveEntry<A> {
    if (entryPath === this.entryPath) {
      return this;
    }
    return new ArchiveEntry({ ...this, entryPath });
  }

  async withFileHeader(fileHeader: ROMHeader): Promise<ArchiveEntry<A>> {
    if (fileHeader === this.fileHeader) {
      return this;
    }
    return await ArchiveEntry.entryOf(
      {
        ...this,
        fileHeader,
        paddings: [],
        patch: undefined,
      },
      this.getChecksumBitmask(),
    );
  }

  withoutFileHeader(): ArchiveEntry<A> {
    if (this.fileHeader === undefined) {
      return this;
    }
    return new ArchiveEntry({
      ...this,
      fileHeader: undefined,
      crc32WithoutHeader: this.getCrc32(),
      md5WithoutHeader: this.getMd5(),
      sha1WithoutHeader: this.getSha1(),
      sha256WithoutHeader: this.getSha256(),
    });
  }

  withPaddings(paddings: ROMPadding[]): ArchiveEntry<A> {
    return new ArchiveEntry({
      ...this,
      fileHeader: paddings.length > 0 ? undefined : this.getFileHeader(),
      paddings,
      patch: paddings.length > 0 ? undefined : this.getPatch(),
    });
  }

  withPatch(patch: Patch): ArchiveEntry<A> {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return new ArchiveEntry({
      ...this,
      fileHeader: undefined,
      paddings: [],
      patch,
    });
  }

  toString(): string {
    if (this.getSymlinkSource()) {
      return `${this.getFilePath()}|${this.getExtractedFilePath()} -> ${this.getSymlinkSource()}|${this.getExtractedFilePath()}`;
    }
    return `${this.getFilePath()}|${this.getExtractedFilePath()}`;
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
