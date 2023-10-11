import 'disposablestack/auto';

import fs, { OpenMode, PathLike } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { Readable } from 'node:stream';
import util from 'node:util';

import Constants from '../../constants.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import URLPoly from '../../polyfill/urlPoly.js';
import Cache from '../cache.js';
import Patch from '../patches/patch.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';
import ROMHeader from './romHeader.js';

export interface FileProps extends ChecksumProps {
  readonly filePath: string;
  readonly size: number;
  readonly crc32WithoutHeader?: string;
  readonly symlinkSource?: string;
  readonly fileHeader?: ROMHeader;
  readonly patch?: Patch;
}

export default class File implements FileProps {
  private static readonly checksumCache = new Cache<string, ChecksumProps>(
    Constants.FILE_CHECKSUM_CACHE_SIZE,
  );

  readonly filePath: string;

  readonly size: number;

  readonly crc32: string;

  readonly crc32WithoutHeader: string;

  readonly md5?: string;

  readonly sha1?: string;

  readonly symlinkSource?: string;

  readonly fileHeader?: ROMHeader;

  readonly patch?: Patch;

  protected constructor(fileProps: FileProps) {
    this.filePath = path.normalize(fileProps.filePath);
    this.size = fileProps.size;
    this.crc32 = (fileProps.crc32 ?? '').toLowerCase().replace(/^0x/, '').padStart(8, '0');
    this.md5 = fileProps.md5?.toLowerCase().replace(/^0x/, '').padStart(32, '0');
    this.sha1 = fileProps.sha1?.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    this.crc32WithoutHeader = (fileProps.crc32WithoutHeader ?? '').toLowerCase().padStart(8, '0');
    this.symlinkSource = fileProps.symlinkSource;
    this.fileHeader = fileProps.fileHeader;
    this.patch = fileProps.patch;
  }

  static async fileOf(
    filePath: string,
    size?: number,
    checksums?: ChecksumProps,
    checksumBitmask: number = ChecksumBitmask.CRC32,
    fileHeader?: ROMHeader,
    patch?: Patch,
  ): Promise<File> {
    let finalSize = size;
    let finalCrcWithHeader = checksums?.crc32;
    let finalCrcWithoutHeader;
    let finalMd5 = checksums?.md5;
    let finalSha1 = checksums?.sha1;
    let finalSymlinkSource;

    if (await fsPoly.exists(filePath)) {
      // Calculate size
      const stat = await util.promisify(fs.stat)(filePath);
      finalSize = finalSize ?? stat.size;

      // Calculate checksums
      if ((!finalCrcWithHeader && (checksumBitmask & ChecksumBitmask.CRC32))
        || (!finalMd5 && (checksumBitmask & ChecksumBitmask.MD5))
        || (!finalSha1 && (checksumBitmask & ChecksumBitmask.SHA1))
      ) {
        const calculatedChecksums = await this.calculateFileChecksums(filePath, checksumBitmask);
        finalCrcWithHeader = calculatedChecksums.crc32 ?? finalCrcWithHeader;
        finalMd5 = calculatedChecksums.md5 ?? finalMd5;
        finalSha1 = calculatedChecksums.sha1 ?? finalSha1;
      }
      if (fileHeader && (checksumBitmask & ChecksumBitmask.CRC32)) {
        finalCrcWithoutHeader = (await this.calculateFileChecksums(
          filePath,
          ChecksumBitmask.CRC32,
          fileHeader,
        )).crc32;
      }

      if (await fsPoly.isSymlink(filePath)) {
        finalSymlinkSource = await fsPoly.readlink(filePath);
      }
    } else {
      finalSize = finalSize ?? 0;
      finalCrcWithHeader = finalCrcWithHeader ?? '';
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader ?? finalCrcWithHeader;

    return new File({
      filePath,
      size: finalSize,
      crc32: finalCrcWithHeader,
      crc32WithoutHeader: finalCrcWithoutHeader,
      md5: finalMd5,
      sha1: finalSha1,
      symlinkSource: finalSymlinkSource,
      fileHeader,
      patch,
    });
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

  getCrc32(): string {
    return this.crc32;
  }

  getCrc32WithoutHeader(): string {
    return this.crc32WithoutHeader;
  }

  getMd5(): string | undefined {
    return this.md5;
  }

  getSha1(): string | undefined {
    return this.sha1;
  }

  protected getSymlinkSource(): string | undefined {
    return this.symlinkSource;
  }

  getSymlinkSourceResolved(): string | undefined {
    if (!this.symlinkSource) {
      return undefined;
    }
    return path.resolve(path.dirname(this.getFilePath()), this.symlinkSource);
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

  protected getChecksumBitmask(): number {
    return (this.getCrc32().replace(/^0|0$/, '') ? ChecksumBitmask.CRC32 : 0)
      | (this.getMd5()?.replace(/^0|0$/, '') ? ChecksumBitmask.MD5 : 0)
      | (this.getSha1()?.replace(/^0|0$/, '') ? ChecksumBitmask.SHA1 : 0);
  }

  // Other functions

  private static async calculateFileChecksums(
    filePath: string,
    checksumBitmask: number,
    fileHeader?: ROMHeader,
  ): Promise<ChecksumProps> {
    const start = fileHeader?.getDataOffsetBytes() ?? 0;

    const cacheKey = `${filePath}|${start}|${checksumBitmask}`;
    return File.checksumCache.getOrCompute(cacheKey, async () => {
      const stream = fs.createReadStream(filePath, {
        start,
        highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      });

      return FileChecksums.hashStream(stream, checksumBitmask);
    });
  }

  async extractToFile(destinationPath: string): Promise<void> {
    await fsPoly.copyFile(this.getFilePath(), destinationPath);
  }

  async extractToTempFile<T>(
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    await using disposableStack = new AsyncDisposableStack();

    const tempFile = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(this.getFilePath()),
    ));
    disposableStack.defer(async () => fsPoly.rm(tempFile, { force: true }));

    await fsPoly.copyFile(this.getFilePath(), tempFile);

    return callback(tempFile);
  }

  async extractToTempFilePoly<T>(
    flags: OpenMode,
    callback: (filePoly: FilePoly) => (T | Promise<T>),
  ): Promise<T> {
    return this.extractToTempFile(async (tempFile) => {
      await using filePoly = await FilePoly.fileFrom(tempFile, flags);
      return callback(filePoly);
    });
  }

  async extractAndPatchToFile(
    destinationPath: string,
    removeHeader: boolean,
  ): Promise<void> {
    await using disposableStack = new AsyncDisposableStack();

    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() ?? 0
      : 0;
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
      Constants.GLOBAL_TEMP_DIR,
      path.basename(this.getExtractedFilePath()),
    ));
    disposableStack.defer(async () => fsPoly.rm(tempFile, { force: true }));
    if (patch) {
      // Create a patched temp file, then copy it without removing its header
      await patch.createPatchedFile(this, tempFile);
      return File.createStreamFromFile(
        tempFile,
        start,
        async (stream) => new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(destinationPath);
          writeStream.on('close', resolve);
          writeStream.on('error', reject);
          stream.pipe(writeStream);
        }),
      );
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
    return File.createStreamFromFile(this.getFilePath(), start, callback);
  }

  async createPatchedReadStream<T>(
    removeHeader: boolean,
    callback: (stream: Readable) => (T | Promise<T>),
  ): Promise<T> {
    await using disposableStack = new AsyncDisposableStack();

    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() ?? 0
      : 0;
    const patch = this.getPatch();

    // Simple case: create a read stream at an offset
    if (!patch) {
      return this.createReadStream(callback, start);
    }

    // Complex case: create a temp patched file and then create read stream at an offset
    const tempFile = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(this.getExtractedFilePath()),
    ));
    disposableStack.defer(async () => fsPoly.rm(tempFile, { force: true }));
    await patch.createPatchedFile(this, tempFile);
    return File.createStreamFromFile(tempFile, start, callback);
  }

  static async createStreamFromFile<T>(
    filePath: PathLike,
    start: number,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    const stream = fs.createReadStream(filePath, {
      start,
      highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
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

    return new Promise((resolve, reject) => {
      https.get(this.getFilePath(), {
        timeout: 30_000,
      }, (res) => {
        const writeStream = fs.createWriteStream(filePath);
        res.pipe(writeStream);
        writeStream.on('finish', async () => {
          writeStream.close();
          resolve(await File.fileOf(filePath, undefined, undefined, this.getChecksumBitmask()));
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

    const filePath = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, tempPrefix));
    return this.downloadToPath(filePath);
  }

  withFilePath(filePath: string): File {
    return new File({
      ...this,
      filePath,
    });
  }

  async withFileHeader(fileHeader: ROMHeader): Promise<File> {
    // Make sure the file actually has the right file signature
    const hasHeader = await this.createReadStream(
      async (stream) => fileHeader.fileHasHeader(stream),
    );
    if (!hasHeader) {
      return this;
    }

    return File.fileOf(
      this.getFilePath(),
      this.getSize(),
      this,
      this.getChecksumBitmask(),
      fileHeader,
      undefined, // don't allow a patch
    );
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
    if (this.getSymlinkSource()) {
      return `${this.getFilePath()} -> ${this.getSymlinkSource()}`;
    }
    return this.getFilePath();
  }

  static hashCode(crc: string, size: number): string {
    return `${crc}|${size}`;
  }

  hashCodeWithHeader(): string {
    return File.hashCode(this.getCrc32(), this.getSize());
  }

  hashCodeWithoutHeader(): string {
    return File.hashCode(this.getCrc32WithoutHeader(), this.getSizeWithoutHeader());
  }

  hashCodes(): string[] {
    return [
      this.hashCodeWithHeader(),
      this.hashCodeWithoutHeader(),
    ].reduce(ArrayPoly.reduceUnique(), []);
  }

  equals(other: File): boolean {
    if (this === other) {
      return true;
    }
    return this.getFilePath() === other.getFilePath()
        && this.getSize() === other.getSize()
        && this.getCrc32() === other.getCrc32()
        && this.getCrc32WithoutHeader() === other.getCrc32WithoutHeader();
  }
}
