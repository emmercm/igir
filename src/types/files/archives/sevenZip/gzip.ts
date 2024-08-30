import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import Tar from '../tar.js';
import SevenZip from './sevenZip.js';

export default class Gzip extends SevenZip {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): SevenZip {
    return new Gzip(filePath);
  }

  static getExtensions(): string[] {
    return ['.gz', '.gzip'];
  }

  // eslint-disable-next-line class-methods-use-this
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
