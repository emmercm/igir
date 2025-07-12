import type Archive from '../archive.js';
import type ArchiveEntry from '../archiveEntry.js';
import Tar from '../tar.js';
import SevenZip from './sevenZip.js';

export default class Gzip extends SevenZip {
  protected new(filePath: string): SevenZip {
    return new Gzip(filePath);
  }

  static getExtensions(): string[] {
    return ['.gz', '.gzip'];
  }

  getExtension(): string {
    return Gzip.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    // See if this file is actually a .tar.gz
    try {
      return await new Tar(this.getFilePath()).getArchiveEntries(checksumBitmask);
    } catch {
      /* ignored */
    }

    return super.getArchiveEntries(checksumBitmask);
  }
}
