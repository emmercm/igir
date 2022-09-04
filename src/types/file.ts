import _7z from '7zip-min';
import AdmZip, { IZipEntry } from 'adm-zip';
import crc32 from 'crc/crc32';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';
import FileHeader from './fileHeader.js';

export default class File {
  private readonly filePath: string;

  private readonly archiveEntryPath?: string;

  private readonly crc32: Promise<string>;

  private readonly fileHeader?: FileHeader;

  constructor(
    filePath: string,
    archiveEntryPath?: string,
    crc?: string,
    fileHeader?: FileHeader,
  ) {
    this.filePath = filePath;
    this.archiveEntryPath = archiveEntryPath;
    this.fileHeader = fileHeader;

    if (crc) {
      this.crc32 = Promise.resolve(crc);
    } else {
      this.crc32 = this.calculateCrc32();
    }
  }

  private async calculateCrc32(): Promise<string> {
    return this.toLocalFile(async (localFile) => {
      return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(localFile, {
          start: this.fileHeader?.dataOffsetBytes || 0,
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
    });
  }

  async resolve(): Promise<this> {
    await this.getCrc32();
    return this;
  }

  withFileHeader(fileHeader: FileHeader): File {
    return new File(
      this.filePath,
      this.archiveEntryPath,
      undefined, // the old CRC can't be used, a header will change it
      fileHeader,
    );
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
    return path.extname(this.filePath).toLowerCase() === '.zip';
  }

  async toLocalFile<T>(
    callback: (localFile: string) => T | Promise<T>,
  ): Promise<T> {
    let tempDir;
    let localFile = this.filePath;

    if (this.archiveEntryPath) {
      tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
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
      return await callback(localFile);
    } finally {
      if (tempDir) {
        fsPoly.rmSync(tempDir, { recursive: true });
      }
    }
  }

  private async extract7zToLocal(tempFile: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      _7z.unpack(this.filePath, path.dirname(tempFile), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private extractZipToLocal(tempFile: string): void {
    const zip = new AdmZip(this.filePath);
    const entry = zip.getEntry(this.archiveEntryPath as string);
    if (!entry) {
      throw new Error(`Entry path ${this.archiveEntryPath} does not exist in ${this.filePath}`);
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
    return this.filePath === other.getFilePath()
        && this.archiveEntryPath === other.getArchiveEntryPath()
        && await this.getCrc32() === await other.getCrc32();
  }
}
