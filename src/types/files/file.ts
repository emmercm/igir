import { crc32 } from '@node-rs/crc32';
import fs, { OpenMode, PathLike } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import util from 'util';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Patch from '../patches/patch.js';
import FileHeader from './fileHeader.js';

export default class File {
  private readonly filePath: string;

  private readonly size: number;

  private readonly crc32: string;

  private readonly crc32WithoutHeader: string;

  private readonly symlinkSource?: string;

  private readonly fileHeader?: FileHeader;

  private readonly patch?: Patch;

  protected constructor(
    filePath: string,
    size: number,
    crc: string,
    crc32WithoutHeader: string,
    symlinkSource?: string,
    fileHeader?: FileHeader,
    patch?: Patch,
  ) {
    this.filePath = path.normalize(filePath);
    this.size = size;
    this.crc32 = crc.toLowerCase().padStart(8, '0');
    this.crc32WithoutHeader = crc32WithoutHeader.toLowerCase().padStart(8, '0');
    this.symlinkSource = symlinkSource;
    this.fileHeader = fileHeader;
    this.patch = patch;
  }

  static async fileOf(
    filePath: string,
    size?: number,
    crc?: string,
    fileHeader?: FileHeader,
    patch?: Patch,
  ): Promise<File> {
    let finalSize = size;
    let finalCrc = crc;
    let finalCrcWithoutHeader;
    let finalSymlinkSource;
    if (await fsPoly.exists(filePath)) {
      const stat = await util.promisify(fs.stat)(filePath);
      finalSize = finalSize || stat.size;
      finalCrc = finalCrc || await this.calculateCrc32(filePath);
      if (await fsPoly.isSymlink(filePath)) {
        finalSymlinkSource = await fsPoly.readlink(filePath);
      }
      if (fileHeader) {
        finalCrcWithoutHeader = finalCrcWithoutHeader
          || await this.calculateCrc32(filePath, fileHeader);
      }
    } else {
      finalSize = finalSize || 0;
      finalCrc = finalCrc || '';
    }
    finalCrcWithoutHeader = finalCrcWithoutHeader || finalCrc;

    return new File(
      filePath,
      finalSize,
      finalCrc,
      finalCrcWithoutHeader,
      finalSymlinkSource,
      fileHeader,
      patch,
    );
  }

  // Property getters

  getFilePath(): string {
    return this.filePath;
  }

  getSize(): number {
    return this.size;
  }

  getSizeWithoutHeader(): number {
    return this.size - (this.fileHeader?.getDataOffsetBytes() || 0);
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

  protected getSymlinkSource(): string | undefined {
    return this.symlinkSource;
  }

  getSymlinkSourceResolved(): string | undefined {
    if (!this.symlinkSource) {
      return undefined;
    }
    return path.resolve(path.dirname(this.getFilePath()), this.symlinkSource);
  }

  getFileHeader(): FileHeader | undefined {
    return this.fileHeader;
  }

  getPatch(): Patch | undefined {
    return this.patch;
  }

  // Other functions

  protected static async calculateCrc32(
    localFile: string,
    fileHeader?: FileHeader,
  ): Promise<string> {
    const start = fileHeader?.getDataOffsetBytes() || 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(localFile, {
        start,
        highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      });

      let crc: number;
      stream.on('data', (chunk) => {
        if (!crc) {
          crc = crc32(chunk);
        } else {
          crc = crc32(chunk, crc);
        }
      });
      stream.on('end', () => {
        resolve((crc || 0).toString(16));
      });

      stream.on('error', reject);
    });
  }

  async extractToFile(destinationPath: string): Promise<void> {
    await fsPoly.copyFile(this.getFilePath(), destinationPath);
  }

  async extractToTempFile<T>(
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempFile = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(this.getFilePath()),
    ));
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

  async extractAndPatchToFile(
    destinationPath: string,
    removeHeader: boolean,
  ): Promise<void> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() || 0
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
    if (patch) {
      // Create a patched temp file, then copy it without removing its header
      await patch.createPatchedFile(this, tempFile);
      try {
        return await File.createStreamFromFile(
          tempFile,
          start,
          async (stream) => new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(destinationPath);
            writeStream.on('close', resolve);
            writeStream.on('error', reject);
            stream.pipe(writeStream);
          }),
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
    return File.createStreamFromFile(this.getFilePath(), start, callback);
  }

  async createPatchedReadStream<T>(
    removeHeader: boolean,
    callback: (stream: Readable) => (T | Promise<T>),
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() || 0
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
    try {
      await patch.createPatchedFile(this, tempFile);
      return await File.createStreamFromFile(tempFile, start, callback);
    } finally {
      await fsPoly.rm(tempFile, { force: true });
    }
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

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
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
      this.getCrc32(),
      fileHeader,
      undefined, // don't allow a patch
    );
  }

  async withPatch(patch: Patch): Promise<File> {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return File.fileOf(
      this.getFilePath(),
      this.getSize(),
      this.getCrc32(),
      undefined, // don't allow a file header
      patch,
    );
  }

  /** *************************
   *                          *
   *     Pseudo Built-Ins     *
   *                          *
   ************************** */

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
    ].filter((hash, idx, hashes) => hashes.indexOf(hash) === idx);
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
