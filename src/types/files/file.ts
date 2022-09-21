import crc32 from 'crc/crc32';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

import Constants from '../../constants.js';
import FileHeader from './fileHeader.js';

export default class File {
  private readonly filePath: string;

  private readonly size: number;

  private crc32?: Promise<string>;

  private crc32WithoutHeader?: Promise<string>;

  private readonly fileHeader?: FileHeader;

  constructor(filePath: string, size?: number, crc?: string, fileHeader?: FileHeader) {
    this.filePath = filePath;

    if (size !== undefined) {
      this.size = size;
    } else {
      this.size = fs.statSync(filePath).size;
    }

    if (crc) {
      this.crc32 = Promise.resolve(crc);
    }

    this.fileHeader = fileHeader;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getSize(): number {
    return this.size;
  }

  getExtractedFilePath(): string {
    return this.filePath;
  }

  async getCrc32(): Promise<string> {
    if (!this.crc32) {
      this.crc32 = this.calculateCrc32(false);
    }
    return (await this.crc32).toLowerCase().padStart(8, '0');
  }

  async getCrc32WithoutHeader(): Promise<string> {
    if (!this.fileHeader) {
      return this.getCrc32();
    }

    if (!this.crc32WithoutHeader) {
      this.crc32WithoutHeader = this.calculateCrc32(true);
    }
    return (await this.crc32WithoutHeader).toLowerCase().padStart(8, '0');
  }

  getFileHeader(): FileHeader | undefined {
    return this.fileHeader;
  }

  // TODO(cemmer): figure out how to eliminate this
  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  private async calculateCrc32(processHeader: boolean): Promise<string> {
    return this.extractToFile(async (localFile) => {
      // If we're hashing a file with a header, make sure the file actually has the header magic
      // string before excluding it
      let start = 0;
      if (processHeader && this.fileHeader && await this.fileHeader.fileHasHeader(localFile)) {
        start = this.fileHeader.dataOffsetBytes;
      }

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
    });
  }

  async resolve(): Promise<this> {
    await this.getCrc32();
    await this.getCrc32WithoutHeader();
    return this;
  }

  async extractToFile<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    return callback(this.filePath);
  }

  async extractToStream<T>(callback: (stream: Readable) => (Promise<T> | T)): Promise<T> {
    const stream = fs.createReadStream(this.filePath);
    const result = await callback(stream);
    stream.destroy();
    return result;
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    return new File(
      this.filePath,
      this.size,
      await this.getCrc32(),
      fileHeader,
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

  async equals(other: File): Promise<boolean> {
    if (this === other) {
      return true;
    }
    return this.getFilePath() === other.getFilePath()
        && this.getSize() === other.getSize()
        && await this.getCrc32() === await other.getCrc32()
        && await this.getCrc32WithoutHeader() === await other.getCrc32WithoutHeader();
  }
}
