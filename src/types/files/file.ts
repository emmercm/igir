import fs, { OpenMode, PathLike } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  Exclude, Expose, instanceToPlain, plainToClassFromExist,
} from 'class-transformer';

import Defaults from '../../globals/defaults.js';
import Temp from '../../globals/temp.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import URLPoly from '../../polyfill/urlPoly.js';
import Patch from '../patches/patch.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';
import ROMHeader from './romHeader.js';

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
  readonly patch?: Patch;
}

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

  readonly symlinkSource?: string;

  readonly fileHeader?: ROMHeader;

  readonly patch?: Patch;

  protected constructor(fileProps: FileProps) {
    this.filePath = path.normalize(fileProps.filePath);
    this.size = fileProps.size ?? 0;
    this.checksumBitmask = fileProps.checksumBitmask;
    this.crc32 = fileProps.crc32?.toLowerCase().replace(/^0x/, '').padStart(8, '0');
    this.crc32WithoutHeader = fileProps.crc32WithoutHeader?.toLowerCase().replace(/^0x/, '').padStart(8, '0');
    this.md5 = fileProps.md5?.toLowerCase().replace(/^0x/, '').padStart(32, '0');
    this.md5WithoutHeader = fileProps.md5WithoutHeader?.toLowerCase().replace(/^0x/, '').padStart(32, '0');
    this.sha1 = fileProps.sha1?.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    this.sha1WithoutHeader = fileProps.sha1WithoutHeader?.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    this.sha256 = fileProps.sha256?.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    this.sha256WithoutHeader = fileProps.sha256WithoutHeader?.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    this.symlinkSource = fileProps.symlinkSource;
    this.fileHeader = fileProps.fileHeader;
    this.patch = fileProps.patch;
  }

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
    let finalMd5WithoutHeader = fileProps.fileHeader
      ? fileProps.md5WithoutHeader
      : fileProps.md5;
    let finalSha1WithHeader = fileProps.sha1;
    let finalSha1WithoutHeader = fileProps.fileHeader
      ? fileProps.sha1WithoutHeader
      : fileProps.sha1;
    let finalSha256WithHeader = fileProps.sha256;
    let finalSha256WithoutHeader = fileProps.fileHeader
      ? fileProps.sha256WithoutHeader
      : fileProps.sha256;
    let finalSymlinkSource = fileProps.symlinkSource;

    if (await fsPoly.exists(fileProps.filePath)) {
      // Calculate size
      if (finalSize === undefined) {
        finalSize = await fsPoly.size(fileProps.filePath);
      }

      // Calculate checksums
      if ((!finalCrcWithHeader && (checksumBitmask & ChecksumBitmask.CRC32))
        || (!finalMd5WithHeader && (checksumBitmask & ChecksumBitmask.MD5))
        || (!finalSha1WithHeader && (checksumBitmask & ChecksumBitmask.SHA1))
        || (!finalSha256WithHeader && (checksumBitmask & ChecksumBitmask.SHA256))
      ) {
        const headeredChecksums = await FileChecksums.hashFile(
          fileProps.filePath,
          checksumBitmask,
        );
        finalCrcWithHeader = headeredChecksums.crc32 ?? finalCrcWithHeader;
        finalMd5WithHeader = headeredChecksums.md5 ?? finalMd5WithHeader;
        finalSha1WithHeader = headeredChecksums.sha1 ?? finalSha1WithHeader;
        finalSha256WithHeader = headeredChecksums.sha256 ?? finalSha256WithHeader;
      }
      if (fileProps.fileHeader && checksumBitmask) {
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

      if (await fsPoly.isSymlink(fileProps.filePath)) {
        finalSymlinkSource = await fsPoly.readlink(fileProps.filePath);
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
      checksumBitmask: checksumBitmask !== ChecksumBitmask.NONE ? checksumBitmask : undefined,
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
      patch: fileProps.patch,
    });
  }

  static async fileOfObject(filePath: string, obj: FileProps): Promise<File> {
    const deserialized = plainToClassFromExist(
      new File({ filePath }),
      obj,
      {
        enableImplicitConversion: true,
        excludeExtraneousValues: true,
      },
    );
    return this.fileOf(deserialized);
  }

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

  getPatch(): Patch | undefined {
    return this.patch;
  }

  isURL(): boolean {
    return URLPoly.canParse(this.getFilePath());
  }

  public getChecksumBitmask(): number {
    return this.checksumBitmask ?? (this.getCrc32()?.replace(/^0+|0+$/, '') ? ChecksumBitmask.CRC32 : 0)
      | (this.getMd5()?.replace(/^0+|0+$/, '') ? ChecksumBitmask.MD5 : 0)
      | (this.getSha1()?.replace(/^0+|0+$/, '') ? ChecksumBitmask.SHA1 : 0)
      | (this.getSha256()?.replace(/^0+|0+$/, '') ? ChecksumBitmask.SHA256 : 0);
  }

  // Other functions

  async extractToFile(destinationPath: string): Promise<void> {
    await fsPoly.copyFile(this.getFilePath(), destinationPath);
  }

  async extractToTempFile<T>(
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempFile = await fsPoly.mktemp(path.join(
      Temp.getTempDir(),
      path.basename(this.getFilePath()),
    ));
    const tempDir = path.dirname(tempFile);
    if (!await fsPoly.exists(tempDir)) {
      await fsPoly.mkdir(tempDir, { recursive: true });
    }
    await fsPoly.copyFile(this.getFilePath(), tempFile);

    try {
      return await callback(tempFile);
    } finally {
      await fsPoly.rm(tempFile, { force: true });
    }
  }

  async extractToTempFilePoly<T>(
    flags: OpenMode,
    callback: (filePoly: FilePoly) => (T | Promise<T>),
  ): Promise<T> {
    return this.extractToTempFile(async (tempFile) => {
      const filePoly = await FilePoly.fileFrom(tempFile, flags);
      try {
        return await callback(filePoly);
      } finally {
        await filePoly.close();
      }
    });
  }

  async extractAndPatchToFile(destinationPath: string): Promise<void> {
    const start = this.getFileHeader()?.getDataOffsetBytes() ?? 0;
    const patch = this.getPatch();

    // Simple case: create a file without removing its header
    if (start <= 0) {
      if (patch) {
        // Patch the file and don't remove its header
        return patch.createPatchedFile(this, destinationPath);
      }
      // Copy the file and don't remove its header
      return this.extractToFile(destinationPath);
    }

    // Complex case: create a temp file with the header removed
    const tempFile = await fsPoly.mktemp(path.join(
      Temp.getTempDir(),
      path.basename(this.getExtractedFilePath()),
    ));
    if (patch) {
      // Create a patched temp file, then copy it without removing its header
      await patch.createPatchedFile(this, tempFile);
      try {
        return await File.createStreamFromFile(
          tempFile,
          async (stream) => new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(destinationPath);
            writeStream.on('close', resolve);
            writeStream.on('error', reject);
            stream.pipe(writeStream);
          }),
          start,
        );
      } finally {
        await fsPoly.rm(tempFile, { force: true });
      }
    }
    // Extract this file removing its header
    return this.createReadStream(async (stream) => new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(destinationPath);
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
      stream.pipe(writeStream);
    }), start);
  }

  async createReadStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    start = 0,
  ): Promise<T> {
    return File.createStreamFromFile(this.getFilePath(), callback, start);
  }

  async createPatchedReadStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
  ): Promise<T> {
    const start = this.getFileHeader()?.getDataOffsetBytes() ?? 0;
    const patch = this.getPatch();

    // Simple case: create a read stream at an offset
    if (!patch) {
      return this.createReadStream(callback, start);
    }

    // Complex case: create a temp patched file and then create read stream at an offset
    const tempFile = await fsPoly.mktemp(path.join(
      Temp.getTempDir(),
      path.basename(this.getExtractedFilePath()),
    ));
    try {
      await patch.createPatchedFile(this, tempFile);
      return await File.createStreamFromFile(tempFile, callback, start);
    } finally {
      await fsPoly.rm(tempFile, { force: true });
    }
  }

  static async createStreamFromFile<T>(
    filePath: PathLike,
    callback: (stream: Readable) => (Promise<T> | T),
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

  async downloadToPath(filePath: string): Promise<File> {
    if (await fsPoly.exists(this.getFilePath())) {
      return this;
    }

    const fileDir = path.dirname(filePath);
    if (!await fsPoly.exists(fileDir)) {
      await fsPoly.mkdir(fileDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      https.get(this.getFilePath(), {
        timeout: 30_000,
      }, (res) => {
        const writeStream = fs.createWriteStream(filePath);
        res.pipe(writeStream);
        writeStream.on('finish', async () => {
          writeStream.close();
          resolve(await File.fileOf({ filePath }, this.getChecksumBitmask()));
        });
      })
        .on('error', reject)
        .on('timeout', reject);
    });
  }

  async downloadToTempPath(tempPrefix: string): Promise<File> {
    if (await fsPoly.exists(this.getFilePath())) {
      return this;
    }

    const filePath = await fsPoly.mktemp(path.join(Temp.getTempDir(), tempPrefix));
    return this.downloadToPath(filePath);
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
    return File.fileOf({
      ...this,
      fileHeader,
      patch: undefined, // don't allow a patch
    }, this.getChecksumBitmask());
  }

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

  withPatch(patch: Patch): File {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return new File({
      ...this,
      fileHeader: undefined,
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
    return this.getSha256()
      ?? this.getSha1()
      ?? this.getMd5()
      ?? `${this.getCrc32()}|${this.getSize()}`;
  }

  equals(other: File): boolean {
    if (this === other) {
      return true;
    }
    return this.getFilePath() === other.getFilePath()
        && this.hashCode() === other.hashCode()
        && this.getFileHeader() === other.getFileHeader();
  }
}
