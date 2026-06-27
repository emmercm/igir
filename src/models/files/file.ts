import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import stream from 'node:stream';

import { Exclude, Expose, instanceToPlain, plainToClassFromExist } from 'class-transformer';

import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import Temp from '../../globals/temp.js';
import IOFile from '../../models/files/ioFile.js';
import FsReadTransform, { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import StreamUtil from '../../utils/streamUtil.js';
import URLUtil from '../../utils/urlUtil.js';
import Patch from '../patches/patch.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';
import ROMHeader from './romHeader.js';
import ROMPadding from './romPadding.js';

export interface FileProps extends ChecksumProps {
  readonly filePath: string;
  readonly size?: number;
  readonly checksumBitmask?: number;
  readonly crc32WithoutHeader?: string;
  readonly md5WithoutHeader?: string;
  readonly sha1WithoutHeader?: string;
  readonly sha256WithoutHeader?: string;
  readonly symlinkSource?: string;
  readonly fileHeader?: ROMHeader;
  readonly paddings?: ROMPadding[];
  readonly patch?: Patch;
  readonly canBeCandidateInput?: boolean;
}

/**
 * A file on disk (or at a URL), carrying size, checksums, and optional header/padding/patch
 * metadata.
 */
@Exclude()
export default class File implements FileProps {
  readonly filePath: string;

  @Expose()
  readonly size: number;

  readonly checksumBitmask?: number;

  @Expose()
  readonly crc32?: string;

  readonly crc32WithoutHeader?: string;

  @Expose()
  readonly md5?: string;

  readonly md5WithoutHeader?: string;

  @Expose()
  readonly sha1?: string;

  readonly sha1WithoutHeader?: string;

  @Expose()
  readonly sha256?: string;

  readonly sha256WithoutHeader?: string;

  readonly isUrl: boolean;

  readonly symlinkSource?: string;

  readonly fileHeader?: ROMHeader;

  readonly paddings: ROMPadding[];

  readonly patch?: Patch;

  readonly canBeCandidateInput?: boolean;

  protected constructor(fileProps: FileProps) {
    const isUrl = URLUtil.canParse(fileProps.filePath);

    this.filePath = isUrl ? fileProps.filePath : path.resolve(fileProps.filePath);
    this.size = fileProps.size ?? 0;
    this.checksumBitmask = fileProps.checksumBitmask;
    this.crc32 = fileProps.crc32?.toLowerCase().replace(/^0x/, '').padStart(8, '0');
    this.crc32WithoutHeader = fileProps.crc32WithoutHeader
      ?.toLowerCase()
      .replace(/^0x/, '')
      .padStart(8, '0');
    this.md5 = fileProps.md5?.toLowerCase().replace(/^0x/, '').padStart(32, '0');
    this.md5WithoutHeader = fileProps.md5WithoutHeader
      ?.toLowerCase()
      .replace(/^0x/, '')
      .padStart(32, '0');
    this.sha1 = fileProps.sha1?.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    this.sha1WithoutHeader = fileProps.sha1WithoutHeader
      ?.toLowerCase()
      .replace(/^0x/, '')
      .padStart(40, '0');
    this.sha256 = fileProps.sha256?.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    this.sha256WithoutHeader = fileProps.sha256WithoutHeader
      ?.toLowerCase()
      .replace(/^0x/, '')
      .padStart(64, '0');
    this.isUrl = isUrl;
    this.symlinkSource = fileProps.symlinkSource;
    this.fileHeader = fileProps.fileHeader;
    this.paddings = fileProps.paddings ?? [];
    this.patch = fileProps.patch;
    this.canBeCandidateInput = fileProps.canBeCandidateInput;
  }

  /**
   * Construct a {@link File} for the given props, computing any missing size and checksums
   * required by the bitmask.
   */
  static async fileOf(
    fileProps: FileProps,
    checksumBitmask: number = ChecksumBitmask.NONE,
  ): Promise<File> {
    let finalSize = fileProps.size;
    let finalCrcWithHeader = fileProps.crc32;
    let finalCrcWithoutHeader = fileProps.fileHeader
      ? fileProps.crc32WithoutHeader
      : fileProps.crc32;
    let finalMd5WithHeader = fileProps.md5;
    let finalMd5WithoutHeader = fileProps.fileHeader ? fileProps.md5WithoutHeader : fileProps.md5;
    let finalSha1WithHeader = fileProps.sha1;
    let finalSha1WithoutHeader = fileProps.fileHeader
      ? fileProps.sha1WithoutHeader
      : fileProps.sha1;
    let finalSha256WithHeader = fileProps.sha256;
    let finalSha256WithoutHeader = fileProps.fileHeader
      ? fileProps.sha256WithoutHeader
      : fileProps.sha256;
    let finalSymlinkSource = fileProps.symlinkSource;

    if (await FsUtil.exists(fileProps.filePath)) {
      // Calculate size
      finalSize ??= await FsUtil.size(fileProps.filePath);

      // Calculate checksums
      if (
        (!finalCrcWithHeader && checksumBitmask & ChecksumBitmask.CRC32) ||
        (!finalMd5WithHeader && checksumBitmask & ChecksumBitmask.MD5) ||
        (!finalSha1WithHeader && checksumBitmask & ChecksumBitmask.SHA1) ||
        (!finalSha256WithHeader && checksumBitmask & ChecksumBitmask.SHA256)
      ) {
        const headeredChecksums = await FileChecksums.hashFile(fileProps.filePath, checksumBitmask);
        finalCrcWithHeader = headeredChecksums.crc32 ?? finalCrcWithHeader;
        finalMd5WithHeader = headeredChecksums.md5 ?? finalMd5WithHeader;
        finalSha1WithHeader = headeredChecksums.sha1 ?? finalSha1WithHeader;
        finalSha256WithHeader = headeredChecksums.sha256 ?? finalSha256WithHeader;
      }
      if (fileProps.fileHeader && checksumBitmask !== ChecksumBitmask.NONE) {
        const headerlessChecksums = await FileChecksums.hashFile(
          fileProps.filePath,
          checksumBitmask,
          fileProps.fileHeader.getDataOffsetBytes(),
        );
        finalCrcWithoutHeader = headerlessChecksums.crc32;
        finalMd5WithoutHeader = headerlessChecksums.md5;
        finalSha1WithoutHeader = headerlessChecksums.sha1;
        finalSha256WithoutHeader = headerlessChecksums.sha256;
      }

      if (await FsUtil.isSymlink(fileProps.filePath)) {
        finalSymlinkSource = await FsUtil.readlink(fileProps.filePath);
      }
    } else {
      finalSize = finalSize ?? 0;
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader ?? finalCrcWithHeader;
    finalMd5WithoutHeader = finalMd5WithoutHeader ?? finalMd5WithHeader;
    finalSha1WithoutHeader = finalSha1WithoutHeader ?? finalSha1WithHeader;
    finalSha256WithoutHeader = finalSha256WithoutHeader ?? finalSha256WithHeader;

    return new File({
      filePath: fileProps.filePath,
      size: finalSize,
      // We were told not to calculate any checksums (default behavior), but some might have been
      // provided, so let {@link getChecksumBitmask()} figure it out
      checksumBitmask: checksumBitmask === ChecksumBitmask.NONE ? undefined : checksumBitmask,
      crc32: finalCrcWithHeader,
      crc32WithoutHeader: finalCrcWithoutHeader,
      md5: finalMd5WithHeader,
      md5WithoutHeader: finalMd5WithoutHeader,
      sha1: finalSha1WithHeader,
      sha1WithoutHeader: finalSha1WithoutHeader,
      sha256: finalSha256WithHeader,
      sha256WithoutHeader: finalSha256WithoutHeader,
      symlinkSource: finalSymlinkSource,
      fileHeader: fileProps.fileHeader,
      paddings: fileProps.paddings,
      patch: fileProps.patch,
      canBeCandidateInput: fileProps.canBeCandidateInput,
    });
  }

  /**
   * Construct a {@link File} by deserializing a plain object — the inverse of {@link toFileProps}.
   */
  static async fileOfObject(filePath: string, obj: FileProps): Promise<File> {
    const deserialized = plainToClassFromExist(new File({ filePath }), obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    return await this.fileOf(deserialized);
  }

  /**
   * Serialize this file into a plain object suitable for persistence.
   */
  toFileProps(): FileProps {
    return instanceToPlain(this, {
      exposeUnsetFields: false,
    }) as FileProps;
  }

  // Property getters

  getFilePath(): string {
    return this.filePath;
  }

  getSize(): number {
    return this.size;
  }

  getSizeWithoutHeader(): number {
    return this.size - (this.fileHeader?.getDataOffsetBytes() ?? 0);
  }

  getExtractedFilePath(): string {
    return path.basename(this.filePath);
  }

  getCrc32(): string | undefined {
    return this.crc32;
  }

  getCrc32WithoutHeader(): string | undefined {
    return this.crc32WithoutHeader;
  }

  getMd5(): string | undefined {
    return this.md5;
  }

  getMd5WithoutHeader(): string | undefined {
    return this.md5WithoutHeader;
  }

  getSha1(): string | undefined {
    return this.sha1;
  }

  getSha1WithoutHeader(): string | undefined {
    return this.sha1WithoutHeader;
  }

  getSha256(): string | undefined {
    return this.sha256;
  }

  getSha256WithoutHeader(): string | undefined {
    return this.sha256WithoutHeader;
  }

  protected getSymlinkSource(): string | undefined {
    return this.symlinkSource;
  }

  getFileHeader(): ROMHeader | undefined {
    return this.fileHeader;
  }

  getPaddings(): ROMPadding[] {
    return this.paddings;
  }

  getPatch(): Patch | undefined {
    return this.patch;
  }

  /**
   * Returns true if this file is addressed by a URL rather than a local filesystem path.
   */
  isURL(): boolean {
    return this.isUrl;
  }

  getCanBeCandidateInput(): boolean {
    return this.canBeCandidateInput ?? true;
  }

  getChecksumBitmask(): number {
    return (
      this.checksumBitmask ??
      (this.getCrc32() ? ChecksumBitmask.CRC32 : 0) |
        (this.getMd5() ? ChecksumBitmask.MD5 : 0) |
        (this.getSha1() ? ChecksumBitmask.SHA1 : 0) |
        (this.getSha256() ? ChecksumBitmask.SHA256 : 0)
    );
  }

  // Other functions

  /**
   * Copy this file to the given destination path.
   */
  async extractToFile(destinationPath: string, callback?: FsReadCallback): Promise<void> {
    await FsUtil.copyFile(this.getFilePath(), destinationPath, callback);
  }

  /**
   * Copy this file to a temporary path, invoke the callback with that path, then clean up.
   */
  async extractToTempFile<T>(callback: (tempFile: string) => T | Promise<T>): Promise<T> {
    const tempFile = await FsUtil.mktemp(
      path.join(Temp.getTempDir(), path.basename(this.getFilePath())),
    );
    const tempDir = path.dirname(tempFile);
    if (!(await FsUtil.exists(tempDir))) {
      await FsUtil.mkdir(tempDir, { recursive: true });
    }
    await this.extractToFile(tempFile);

    try {
      return await callback(tempFile);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  }

  /**
   * Copy this file to a temporary path, open it as an {@link IOFile} with the given flags,
   * invoke the callback with the open handle, then close and clean up.
   */
  async extractToTempIOFile<T>(
    flags: fs.OpenMode,
    callback: (ioFile: IOFile) => T | Promise<T>,
  ): Promise<T> {
    return await this.extractToTempFile(async (tempFile) => {
      const ioFile = await IOFile.fileFrom(tempFile, flags);
      try {
        return await callback(ioFile);
      } finally {
        await ioFile.close();
      }
    });
  }

  /**
   * Write this file to the destination path, stripping any header and applying any associated
   * patch.
   */
  async extractAndTransformToFile(
    destinationPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    // If there are any paddings then we must use createTransformedReadStream()
    if (this.getPaddings().length > 0) {
      await this.createTransformedReadStream(async (readable) => {
        const writeStream = fs.createWriteStream(destinationPath);
        if (callback) {
          await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
        } else {
          await stream.promises.pipeline(readable, writeStream);
        }
      });
      return;
    }

    const start = this.getFileHeader()?.getDataOffsetBytes() ?? 0;
    const patch = this.getPatch();

    // No header: create a file without using streams
    if (start <= 0) {
      if (patch) {
        // Patch the file and don't remove its header
        await patch.createPatchedFile(this, destinationPath, callback);
        return;
      }
      // Copy the file and don't remove its header
      await this.extractToFile(destinationPath, callback);
      return;
    }

    // Headered+patched file: patch to a temp file, and then remove the header using streaming
    if (patch) {
      // Create a patched temp file, then copy it without removing its header
      const tempFile = await FsUtil.mktemp(
        path.join(Temp.getTempDir(), path.basename(this.getExtractedFilePath())),
      );
      await patch.createPatchedFile(this, tempFile, callback);
      try {
        await File.createStreamFromFile(
          tempFile,
          async (readable) => {
            const writeStream = fs.createWriteStream(destinationPath);
            if (callback) {
              await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
            } else {
              await stream.promises.pipeline(readable, writeStream);
            }
          },
          start,
        );
        return;
      } finally {
        await FsUtil.rm(tempFile, { force: true });
      }
    }

    // Headered: remove the header using streaming
    await this.createReadStream(async (readable) => {
      const writeStream = fs.createWriteStream(destinationPath);
      if (callback) {
        await stream.promises.pipeline(readable, new FsReadTransform(callback), writeStream);
      } else {
        await stream.promises.pipeline(readable, writeStream);
      }
    }, start);
  }

  /**
   * Invoke the callback with a readable stream of this file's bytes, optionally starting at a
   * byte offset.
   */
  async createReadStream<T>(
    callback: (readable: stream.Readable) => T | Promise<T>,
    start = 0,
  ): Promise<T> {
    return await File.createStreamFromFile(this.getFilePath(), callback, start);
  }

  /**
   * Invoke the callback with a readable stream of this file's bytes after stripping any header
   * and applying any associated patch.
   */
  async createTransformedReadStream<T>(
    callback: (readable: stream.Readable) => T | Promise<T>,
  ): Promise<T> {
    const start = this.getFileHeader()?.getDataOffsetBytes() ?? 0;
    const patch = this.getPatch();
    const paddings = this.getPaddings();
    if (paddings.length > 1) {
      throw new IgirException(
        `multiple paddings present for ${this.toString()}; callers must narrow to one via withPaddings([...]) before writing`,
      );
    }
    const wrappedCallback =
      paddings.length === 0
        ? callback
        : async (readable: stream.Readable): Promise<T> => {
            const padding = paddings[0];
            const padded = StreamUtil.padEnd(
              readable,
              padding.getPaddedSize(),
              padding.getFillByte(),
            );
            return await callback(padded);
          };

    // Simple case: create a read stream at an offset
    if (!patch) {
      return await this.createReadStream(wrappedCallback, start);
    }

    // Complex case: create a temp patched file and then create read stream at an offset
    const tempFile = await FsUtil.mktemp(
      path.join(Temp.getTempDir(), path.basename(this.getExtractedFilePath())),
    );
    try {
      await patch.createPatchedFile(this, tempFile);
      return await File.createStreamFromFile(tempFile, wrappedCallback, start);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  }

  /**
   * Open a file path as a readable stream and invoke the callback with it, optionally bounded
   * by start/end byte offsets.
   */
  static async createStreamFromFile<T>(
    filePath: fs.PathLike,
    callback: (readable: stream.Readable) => Promise<T> | T,
    start?: number,
    end?: number,
  ): Promise<T> {
    const stream = fs.createReadStream(filePath, {
      start,
      end,
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    try {
      return await callback(stream);
    } finally {
      stream.destroy();
    }
  }

  /**
   * Download this URL-backed file to the given local path, following HTTP redirects, and
   * return a {@link File} for the downloaded copy.
   */
  async downloadToPath(filePath: string): Promise<File> {
    if (await FsUtil.exists(this.getFilePath())) {
      return this;
    }

    const fileDir = path.dirname(filePath);
    if (!(await FsUtil.exists(fileDir))) {
      await FsUtil.mkdir(fileDir, { recursive: true });
    }

    const sourceUrl = new URL(this.getFilePath());
    const client = sourceUrl.protocol === 'http:' ? http : https;

    return await new Promise((resolve, reject) => {
      const req = client.get(
        sourceUrl,
        {
          timeout: 30_000,
        },
        (res) => {
          if (
            res.statusCode !== undefined &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const redirectedUrl = new URL(res.headers.location, sourceUrl).href;
            File.fileOf({ filePath: redirectedUrl })
              .then(async (file) => await file.downloadToPath(filePath))
              .then(resolve)
              .catch(reject);
            res.destroy();
            return;
          }

          const writeStream = fs.createWriteStream(filePath);
          res.pipe(writeStream);
          writeStream.on('error', reject);
          writeStream.on('finish', async () => {
            writeStream.close();
            resolve(await File.fileOf({ filePath }, this.getChecksumBitmask()));
          });
        },
      );
      req.on('error', reject).on('timeout', () => {
        req.destroy(new Error('request timed out'));
      });
    });
  }

  /**
   * Download this URL-backed file to a temporary local path and return a {@link File} for the
   * downloaded copy.
   */
  async downloadToTempPath(): Promise<File> {
    if (await FsUtil.exists(this.getFilePath())) {
      return this;
    }

    const lastUrlSegment = new URL(this.getFilePath()).pathname.split('/').slice(-1).at(0);
    const tempPrefix =
      lastUrlSegment === undefined ? 'temp' : FsUtil.makeLegal(decodeURIComponent(lastUrlSegment));

    const filePath = await FsUtil.mktemp(path.join(Temp.getTempDir(), tempPrefix));
    return await this.downloadToPath(filePath);
  }

  withProps(props: Omit<FileProps, 'filePath' | 'fileHeader' | 'patch'>): File {
    return new File({
      ...this,
      ...props,
    });
  }

  withFilePath(filePath: string): File {
    if (filePath === this.filePath) {
      return this;
    }
    return new File({ ...this, filePath });
  }

  async withFileHeader(fileHeader: ROMHeader): Promise<File> {
    if (fileHeader === this.fileHeader) {
      return this;
    }
    return await File.fileOf(
      {
        ...this,
        fileHeader,
        paddings: [],
        patch: undefined,
      },
      this.getChecksumBitmask(),
    );
  }

  /**
   * Return a file with any associated header cleared and the header-less checksums promoted to
   * the primary checksum fields.
   */
  withoutFileHeader(): File {
    if (this.fileHeader === undefined) {
      return this;
    }
    return new File({
      ...this,
      fileHeader: undefined,
      crc32WithoutHeader: this.getCrc32(),
      md5WithoutHeader: this.getMd5(),
      sha1WithoutHeader: this.getSha1(),
      sha256WithoutHeader: this.getSha256(),
    });
  }

  withPaddings(paddings: ROMPadding[]): File {
    return new File({
      ...this,
      fileHeader: paddings.length > 0 ? undefined : this.getFileHeader(),
      paddings,
      patch: paddings.length > 0 ? undefined : this.getPatch(),
    });
  }

  withPatch(patch: Patch): File {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return new File({
      ...this,
      fileHeader: undefined,
      paddings: [],
      patch,
    });
  }

  /**
   ****************************
   *
   *     Pseudo Built-Ins     *
   *
   ****************************
   */

  /**
   * Return a human-readable identifier for this file.
   */
  toString(): string {
    // TODO(cemmer): indicate if there's a patch?
    if (this.getSymlinkSource()) {
      return `${this.getFilePath()} -> ${this.getSymlinkSource()}`;
    }
    return this.getFilePath();
  }

  /**
   * A string hash code to uniquely identify this {@link File}.
   */
  hashCode(): string {
    return this.isURL()
      ? this.getFilePath()
      : (this.getSha256() ??
          this.getSha1() ??
          this.getMd5() ??
          `${this.getCrc32()}|${this.getSize()}`);
  }

  /**
   * Return true if the other file has the same path, hash code, header, and paddings.
   */
  equals(other: File): boolean {
    if (this === other) {
      return true;
    }
    return (
      this.getFilePath() === other.getFilePath() &&
      this.hashCode() === other.hashCode() &&
      this.getFileHeader() === other.getFileHeader() &&
      this.getPaddings().length === other.getPaddings().length &&
      this.getPaddings().every((padding, idx) => padding === other.getPaddings()[idx])
    );
  }
}
