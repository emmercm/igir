import path from 'node:path';

import IOFile from '../../../polyfill/ioFile.js';
import IgirException from '../../exceptions/igirException.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

// @see https://wiki.gbatemp.net/wiki/NKit/NKitFormat
export default class NkitIso extends Archive {
  protected new(filePath: string): Archive {
    return new NkitIso(filePath);
  }

  static getExtensions(): string[] {
    return ['.nkit.iso'];
  }

  getExtension(): string {
    return NkitIso.getExtensions()[0];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async extractEntryToFile(): Promise<void> {
    throw new IgirException("extraction isn't supported for NKit ISO files");
  }

  async getArchiveEntries(): Promise<ArchiveEntry<this>[]> {
    const file = await IOFile.fileFrom(this.getFilePath(), 'r');
    try {
      const crc32 = (await file.readAt(0x2_08, 0x4)).toString('hex');
      const size = (await file.readAt(0x2_10, 0x4)).readUInt32BE();

      const archiveEntry = await ArchiveEntry.entryOf({
        archive: this,
        entryPath: path.basename(this.getFilePath()).replace(/\.nkit/i, ''),
        size,
        crc32,
      });
      return [archiveEntry];
    } finally {
      await file.close();
    }
  }
}
