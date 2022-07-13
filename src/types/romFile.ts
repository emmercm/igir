import _7z from '7zip-min';
import AdmZip, { IZipEntry } from 'adm-zip';
import crc32 from 'crc/crc32';
import fs from 'fs';
import fsPromises from 'node:fs/promises';
import * as os from 'os';
import path from 'path';

export default class ROMFile {
  private readonly filePath!: string;

  private readonly archiveEntryPath?: string;

  private readonly crc!: string;

  constructor(filePath: string, entryPath?: string, crc?: string) {
    this.filePath = filePath;
    this.archiveEntryPath = entryPath;
    this.crc = (crc || crc32(fs.readFileSync(filePath)).toString(16)).toLowerCase().padStart(8, '0');
  }

  getFilePath(): string {
    return this.filePath;
  }

  getArchiveEntryPath(): string | undefined {
    return this.archiveEntryPath;
  }

  getCrc(): string {
    return this.crc;
  }

  async toLocalFile(): Promise<ROMFile> {
    if (this.archiveEntryPath) {
      const tempDir = await fsPromises.mkdtemp(os.tmpdir());
      const tempFile = path.join(tempDir, this.archiveEntryPath);

      if (path.extname(this.filePath) === '.7z') {
        await this.extract7zToLocal(tempFile);
      } else if (path.extname(this.filePath) === '.zip') {
        this.extractZipToLocal(tempFile);
      }

      return new ROMFile(tempFile, '', this.crc);
    }

    return this;
  }

  private async extract7zToLocal(tempFile: string) {
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

  private extractZipToLocal(tempFile: string) {
    const zip = new AdmZip(this.filePath);
    zip.extractEntryTo(
      zip.getEntry(this.archiveEntryPath as string) as IZipEntry,
      path.dirname(tempFile),
      false,
      false,
      false,
      path.basename(tempFile),
    );
  }

  async cleanupLocalFile() {
    if (path.resolve(this.filePath).indexOf(os.tmpdir()) !== -1) {
      await fsPromises.rm(path.dirname(this.filePath), { recursive: true });
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
        && this.getCrc() === other.getCrc();
  }
}
