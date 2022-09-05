import crc32 from 'crc/crc32';
import fs from 'fs';
import { PathLike } from 'node:fs';

export default class File {
  private readonly filePath: string;

  private readonly crc32: Promise<string>;

  constructor(filePath: string, crc?: string) {
    this.filePath = filePath;
    if (crc) {
      this.crc32 = Promise.resolve(crc);
    } else {
      this.crc32 = File.calculateCrc32(filePath);
    }
  }

  private static async calculateCrc32(pathLike: PathLike): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(pathLike, {
        highWaterMark: 1024 * 1024, // 1MB
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

  async resolve(): Promise<this> {
    await this.getCrc32();
    return this;
  }

  getFilePath(): string {
    return this.filePath;
  }

  async getCrc32(): Promise<string> {
    return (await this.crc32).toLowerCase().padStart(8, '0');
  }

  async extract(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void> {
    await callback(this.filePath);
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
