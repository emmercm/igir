import crc32 from 'crc/crc32';
import fs from 'fs';
import path from 'path';

import Constants from '../../constants.js';
import FileHeader from './fileHeader.js';

export default class File {
  private readonly filePath: string;

  private crc32?: Promise<string>;

  private readonly fileHeader?: FileHeader;

  constructor(filePath: string, crc?: string, fileHeader?: FileHeader) {
    this.filePath = filePath;
    this.fileHeader = fileHeader;

    if (crc) {
      this.crc32 = Promise.resolve(crc);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }

  getExtractedFilePath(): string {
    return this.filePath;
  }

  async getCrc32(): Promise<string> {
    if (!this.crc32) {
      this.crc32 = this.calculateCrc32();
    }
    return (await this.crc32).toLowerCase().padStart(8, '0');
  }

  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  private async calculateCrc32(): Promise<string> {
    return this.extract(async (localFile) => {
      // If we're hashing a file with a header, make sure the file actually has the header magic
      // string before excluding it
      let start = 0;
      if (this.fileHeader && await this.fileHeader.fileHasHeader(localFile)) {
        start = this.fileHeader.dataOffsetBytes;
      }

      return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(localFile, {
          start,
          highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
        });

        // TODO(cemmer): swap this out for the 'crypto' library
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
    return this;
  }

  async extract<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    return callback(this.filePath);
  }

  withFileHeader(fileHeader: FileHeader): File {
    return new File(
      this.filePath,
      undefined, // the old CRC can't be used, a header will change it
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
        && await this.getCrc32() === await other.getCrc32();
  }
}
