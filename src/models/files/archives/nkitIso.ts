import fs from 'node:fs';
import path from 'node:path';

import IgirException from '../../../exceptions/igirException.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

/**
 * An NKit-shrunken Wii/GameCube ISO, exposed as a read-only archive carrying the original
 * disc's checksum and size.
 * @see https://wiki.gbatemp.net/wiki/NKit/NKitFormat
 */
export default class NkitIso extends Archive {
  /**
   * Construct a new {@link NkitIso} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new NkitIso(filePath);
  }

  static getExtensions(): string[] {
    return ['.nkit.iso'];
  }

  getExtensions(): string[] {
    return NkitIso.getExtensions();
  }

  /**
   * Returns false: NKit ISO files cannot be extracted back to their original form.
   */
  canExtract(): boolean {
    return false;
  }

  /**
   * Returns false: entry paths for NKit ISO files are synthesized by Igir.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  /**
   * Always throw — extraction is not supported for NKit ISO files.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async extractEntryToFile(): Promise<void> {
    throw new IgirException("extraction isn't supported for NKit ISO files");
  }

  async getArchiveEntries(): Promise<ArchiveEntry<this>[]> {
    const file = await fs.promises.open(this.getFilePath(), 'r');
    try {
      // The original disc's CRC32 is at 0x208, and its size is at 0x210
      const header = Buffer.alloc(0xc);
      const { bytesRead } = await file.read(header, 0, header.length, 0x2_08);
      if (bytesRead < header.length) {
        throw new IgirException(`NKit ISO header is truncated: ${this.getFilePath()}`);
      }
      const crc32 = header.subarray(0, 0x4).toString('hex');
      const size = header.readUInt32BE(0x8);

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
