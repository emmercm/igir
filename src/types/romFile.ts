import _7z from '7zip-min';
import AdmZip, { IZipEntry } from 'adm-zip';
import crc32 from 'crc/crc32';
import fs from 'fs';
import fsPromises from 'node:fs/promises';
import os from 'os';
import path from 'path';

export default class ROMFile {
  private readonly filePath!: string;

  private readonly archiveEntryPath?: string;

  private readonly crc32!: string;

  constructor(filePath: string, entryPath?: string, crc?: string) {
    this.filePath = filePath;
    this.archiveEntryPath = entryPath;
    this.crc32 = (crc || crc32(fs.readFileSync(filePath)).toString(16)).toLowerCase().padStart(8, '0');
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

  async toLocalFile(tempDir: string): Promise<ROMFile> {
    if (this.archiveEntryPath) {
      const tempFile = path.join(tempDir, this.archiveEntryPath);

      if (path.extname(this.filePath) === '.7z') {
        await this.extract7zToLocal(tempFile);
      } else if (path.extname(this.filePath) === '.zip') {
        this.extractZipToLocal(tempFile);
      }

      return new ROMFile(tempFile, '', this.crc32);
    }

    return this;
  }

  private async extract7zToLocal(tempFile: string) {
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

  private extractZipToLocal(tempFile: string) {
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

  async cleanupLocalFile() {
    if (path.resolve(this.getFilePath()).indexOf(os.tmpdir()) !== -1) {
      await fsPromises.rm(path.dirname(this.getFilePath()), { force: true, recursive: true });
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
