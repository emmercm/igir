import crc32 from 'crc/crc32';
import fs, { PathLike, promises as fsPromises } from 'fs';
import path from 'path';
import { Readable } from 'stream';

import Constants from '../../constants.js';
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
    if (finalSize === undefined) {
      if (await fsPoly.exists(filePath)) {
        finalSize = (await fsPromises.stat(filePath)).size;
      } else {
        finalSize = 0;
      }
    }

    let finalCrc = crc;
    if (!finalCrc) {
      finalCrc = await this.calculateCrc32(filePath);
    }

    let finalCrcWithoutHeader = finalCrc;
    if (fileHeader) {
      finalCrcWithoutHeader = await this.calculateCrc32(filePath, fileHeader);
    }

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
    return this.size - (this.fileHeader?.dataOffsetBytes || 0);
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
    const start = fileHeader?.dataOffsetBytes || 0;

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
    useTempFile = false,
  ): Promise<T> {
    if (useTempFile) {
      const temp = fsPoly.mktempSync(path.join(
        Constants.GLOBAL_TEMP_DIR,
        path.basename(this.getFilePath()),
      ));
      await fsPromises.copyFile(this.getFilePath(), temp);
      const result = await callback(temp);
      await fsPoly.rm(temp);
      return result;
    }

    return callback(this.getFilePath());
  }

  async extractToStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    removeHeader = false,
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.dataOffsetBytes || 0
      : 0;

    // Apply the patch if there is one
    if (this.getPatch()) {
      const patch = this.getPatch() as Patch;
      return patch.apply(this, async (tempFile) => File
        .createStreamFromFile(tempFile, start, callback));
    }

    return File.createStreamFromFile(this.filePath, start, callback);
  }

  static async createStreamFromFile<T>(
    filePath: PathLike,
    start: number,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    const stream = fs.createReadStream(filePath, { start });
    const result = await callback(stream);
    stream.destroy();
    return result;
  }

  async withFileName(fileNameWithoutExt: string): Promise<File> {
    const { base, ...parsedFilePath } = path.parse(this.getFilePath());
    parsedFilePath.name = fileNameWithoutExt;
    const filePath = path.format(parsedFilePath);

    return File.fileOf(
      filePath,
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withExtractedFilePath(extractedNameWithoutExt: string): Promise<File> {
    return this.withFileName(extractedNameWithoutExt);
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    // Make sure the file actually has the header magic string
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

  hashCodes(): string[] {
    return [
      File.hashCode(this.getCrc32(), this.getSize()),
      File.hashCode(this.getCrc32WithoutHeader(), this.getSizeWithoutHeader()),
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
