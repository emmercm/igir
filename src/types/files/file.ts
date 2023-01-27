import crc32 from 'crc/crc32';
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

  private readonly fileHeader?: FileHeader;

  private readonly patch?: Patch;

  protected constructor(
    filePath: string,
    size: number,
    crc: string,
    crc32WithoutHeader: string,
    fileHeader?: FileHeader,
    patch?: Patch,
  ) {
    this.filePath = path.normalize(filePath);
    this.size = size;
    this.crc32 = crc.toLowerCase().padStart(8, '0');
    this.crc32WithoutHeader = crc32WithoutHeader.toLowerCase().padStart(8, '0');
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
    if (await fsPoly.exists(filePath)) {
      finalSize = finalSize || (await util.promisify(fs.stat)(filePath)).size;
      finalCrc = finalCrc || await this.calculateCrc32(filePath);
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

      stream.on('error', (err) => reject(err));
    });
  }

  async extractToFile<T>(
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    return callback(this.getFilePath());
  }

  async extractToFilePoly<T>(
    flags: OpenMode,
    callback: (filePoly: FilePoly) => (T | Promise<T>),
  ): Promise<T> {
    return this.extractToFile(async (localFile) => {
      const filePoly = await FilePoly.fileFrom(localFile, flags);
      try {
        return await callback(filePoly);
      } finally {
        await filePoly.close();
      }
    });
  }

  async extractToTempFile<T>(
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const temp = await fsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      `${path.basename(this.getFilePath())}.temp`,
    ));
    await util.promisify(fs.copyFile)(this.getFilePath(), temp);
    try {
      return await callback(temp);
    } finally {
      await fsPoly.rm(temp);
    }
  }

  async extractToStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    removeHeader = false,
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.getDataOffsetBytes() || 0
      : 0;

    // Apply the patch if there is one
    if (this.getPatch()) {
      const patch = this.getPatch() as Patch;
      return patch.apply(
        this,
        async (tempFile) => File.createStreamFromFile(tempFile, start, callback),
      );
    }

    return File.createStreamFromFile(this.filePath, start, callback);
  }

  static async createStreamFromFile<T>(
    filePath: PathLike,
    start: number,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    const stream = fs.createReadStream(filePath, { start });
    try {
      return await callback(stream);
    } finally {
      stream.destroy();
    }
  }

  async withExtractedFilePath(filePath: string): Promise<File> {
    return File.fileOf(
      path.join(path.dirname(this.getFilePath()), filePath),
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    // Make sure the file actually has the right file signature
    const hasHeader = await this.extractToStream(
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
    return this.filePath;
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
