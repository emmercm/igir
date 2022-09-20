import AdmZip, { IZipEntry } from 'adm-zip';
import path from 'path';
import { Readable } from 'stream';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  getArchiveEntries(): Promise<ArchiveEntry[]> {
    // WARN: every constructor causes a full file read!
    const zip = new AdmZip(this.getFilePath());
    const files = zip.getEntries()
      .map((entry) => new ArchiveEntry(
        this,
        entry.entryName,
        entry.header.crc.toString(16),
      ));
    return Promise.resolve(files);
  }

  async extractEntryToFile<T>(
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath());

    // WARN: every constructor causes a full file read!
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

  async extractEntryToStream<T>(
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    // WARN: every constructor causes a full file read!
    const zip = new AdmZip(this.getFilePath());
    const entry = zip.getEntry(archiveEntry.getEntryPath());
    if (!entry) {
      throw new Error(`Entry path ${archiveEntry.getEntryPath()} does not exist in ${this.getFilePath()}`);
    }

    // TODO(cemmer): limit on how large of a file we can do this with
    const stream = Readable.from(entry.getData());
    return callback(stream);
  }
}
