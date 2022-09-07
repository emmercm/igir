import AdmZip, { IZipEntry } from 'adm-zip';
import { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

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

  async extractEntry(
    archiveEntry: ArchiveEntry,
    callback: (localFile: string) => (void | Promise<void>),
  ): Promise<void> {
    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
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

    try {
      await callback(localFile);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }
}
