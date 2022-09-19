import AdmZip, { IZipEntry } from 'adm-zip';
import path from 'path';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  getArchiveEntries(): Promise<ArchiveEntry[]> {
    const zip = new AdmZip(this.getFilePath());
    const files = zip.getEntries()
      .map((entry) => new ArchiveEntry(
        this,
        entry.entryName,
        entry.header.crc.toString(16),
      ));
    return Promise.resolve(files);
  }

  async extractEntry<T>(
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath());

    const zip = new AdmZip(this.getFilePath());
    const entry = zip.getEntry(archiveEntry.getEntryPath());
    if (!entry) {
      throw new Error(`Entry path ${archiveEntry.getEntryPath()} does not exist in ${this.getFilePath()}`);
    }
    zip.extractEntryTo(
      entry as IZipEntry,
      tempDir,
      false,
      false,
      false,
      archiveEntry.getEntryPath(),
    );

    return callback(localFile);
  }
}
