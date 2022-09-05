import AdmZip, { IZipEntry } from 'adm-zip';
import { promises as fsPromises } from 'fs';
import path from 'path';

import fsPoly from '../../polyfill/fsPoly.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  listAllEntryPaths(): Promise<Archive[]> {
    const zip = new AdmZip(this.getFilePath());
    const files = zip.getEntries()
      .map((entry) => new Zip(
        this.getFilePath(),
        entry.entryName,
        entry.header.crc.toString(16),
      ));
    return Promise.resolve(files);
  }

  async extract(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void> {
    const tempDir = await fsPromises.mkdtemp(globalTempDir);
    const localFile = path.join(tempDir, this.getArchiveEntryPath() as string);

    const zip = new AdmZip(this.getFilePath());
    const entry = zip.getEntry(this.getArchiveEntryPath() as string);
    if (!entry) {
      throw new Error(`Entry path ${this.getArchiveEntryPath()} does not exist in ${this.getFilePath()}`);
    }
    zip.extractEntryTo(
      entry as IZipEntry,
      tempDir,
      false,
      false,
      false,
      this.getArchiveEntryPath(),
    );

    try {
      await callback(localFile);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }
}
