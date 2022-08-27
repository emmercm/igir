import _7z from '7zip-min';
import AdmZip, { IZipEntry } from 'adm-zip';
import crc32 from 'crc/crc32';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';

export default class ROMFile {
  private readonly filePath: string;

  private readonly archiveEntryPath?: string;

  private readonly crc32: string;

  private readonly extractedTempFile: boolean;

  constructor(
    filePath: string,
    archiveEntryPath?: string,
    crc?: string,
    extractedTempFile = false,
  ) {
    this.filePath = filePath;
    this.archiveEntryPath = archiveEntryPath;
    this.crc32 = (crc || crc32(fs.readFileSync(filePath)).toString(16)).toLowerCase().padStart(8, '0');
    this.extractedTempFile = extractedTempFile;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getArchiveEntryPath(): string | undefined {
    return this.archiveEntryPath;
  }

  getCrc32(): string {
    return this.crc32;
  }

  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  private isExtractedTempFile(): boolean {
    return this.extractedTempFile;
  }

  async toLocalFile(globalTempDir: string): Promise<ROMFile> {
    if (this.archiveEntryPath) {
      const tempDir = await fsPromises.mkdtemp(globalTempDir);
      const tempFile = path.join(tempDir, this.archiveEntryPath);

      if (Constants.ZIP_EXTENSIONS.indexOf(path.extname(this.filePath)) !== -1) {
        this.extractZipToLocal(tempFile);
      } else if (Constants.SEVENZIP_EXTENSIONS.indexOf(path.extname(this.filePath)) !== -1) {
        await this.extract7zToLocal(tempFile);
      } else {
        throw new Error(`Unknown archive type: ${this.filePath}`);
      }
    }

    return this;
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

  cleanupLocalFile(): void {
    if (this.isExtractedTempFile()) {
      fsPoly.rmSync(path.dirname(this.getFilePath()), { recursive: true });
    }
  }

  equals(other: ROMFile): boolean {
    if (this === other) {
      return true;
    }
    if (!other || typeof this !== typeof other) {
      return false;
    }
    return this.getFilePath() === other.getFilePath()
        && this.getArchiveEntryPath() === other.getArchiveEntryPath()
        && this.getCrc32() === other.getCrc32();
  }
}
