import _7z from '7zip-min';
import AdmZip, { IZipEntry } from 'adm-zip';
import crc32 from 'crc/crc32';
import fs, { promises as fsPromises } from 'fs';
import { PathLike } from 'node:fs';
import path from 'path';

import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';

export default class File {
  private readonly filePath: string;

  private readonly archiveEntryPath?: string;

  private readonly crc32: Promise<string>;

  constructor(
    filePath: string,
    archiveEntryPath?: string,
    crc?: string,
  ) {
    this.filePath = filePath;
    this.archiveEntryPath = archiveEntryPath;
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

  /** *************************
   *                          *
   *     Property Getters     *
   *                          *
   ************************** */

  getFilePath(): string {
    return this.filePath;
  }

  getArchiveEntryPath(): string | undefined {
    return this.archiveEntryPath;
  }

  async getCrc32(): Promise<string> {
    return (await this.crc32).toLowerCase().padStart(8, '0');
  }

  /** ************************
   *                         *
   *     Other Functions     *
   *                         *
   ************************* */

  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  async toLocalFile(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void> {
    let tempDir;
    let localFile = this.filePath;

    if (this.archiveEntryPath) {
      tempDir = await fsPromises.mkdtemp(globalTempDir);
      localFile = path.join(tempDir, this.archiveEntryPath);

      if (Constants.ZIP_EXTENSIONS.indexOf(path.extname(this.filePath)) !== -1) {
        this.extractZipToLocal(localFile);
      } else if (Constants.SEVENZIP_EXTENSIONS.indexOf(path.extname(this.filePath)) !== -1) {
        await this.extract7zToLocal(localFile);
      } else {
        throw new Error(`Unknown archive type: ${this.filePath}`);
      }
    }

    try {
      await callback(localFile);
    } finally {
      if (tempDir) {
        fsPoly.rmSync(tempDir, { recursive: true });
      }
    }
  }

  private async extract7zToLocal(tempFile: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      _7z.unpack(this.getFilePath(), path.dirname(tempFile), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private extractZipToLocal(tempFile: string): void {
    const zip = new AdmZip(this.getFilePath());
    const entry = zip.getEntry(this.getArchiveEntryPath() as string);
    if (!entry) {
      throw new Error(`Entry path ${this.getArchiveEntryPath()} does not exist in ${this.getFilePath()}`);
    }
    zip.extractEntryTo(
      entry as IZipEntry,
      path.dirname(tempFile),
      false,
      false,
      false,
      path.basename(tempFile),
    );
  }

  /** *************************
   *                          *
   *     Pseudo Built-Ins     *
   *                          *
   ************************** */

  toString(): string {
    let message = this.filePath;
    if (this.archiveEntryPath) {
      message += `|${this.archiveEntryPath}`;
    }
    return message;
  }

  async equals(other: File): Promise<boolean> {
    if (this === other) {
      return true;
    }
    return this.getFilePath() === other.getFilePath()
        && this.getArchiveEntryPath() === other.getArchiveEntryPath()
        && await this.getCrc32() === await other.getCrc32();
  }
}
