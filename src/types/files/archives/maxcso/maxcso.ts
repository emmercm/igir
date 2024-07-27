import path from 'node:path';

import maxcso from 'maxcso';

import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Maxcso extends Archive {
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;
    const crc32 = await maxcso.uncompressedCrc32(this.getFilePath());

    // If this file won't need decompressing to calculate other checksums, then save disk thrash
    // by calculating its uncompressed size in memory
    const size = !checksumBitmask || checksumBitmask === ChecksumBitmask.CRC32
      ? await maxcso.uncompressedSize(this.getFilePath())
      : 0;

    return [await ArchiveEntry.entryOf({
      archive: this,
      entryPath,
      size,
      crc32,
    }, checksumBitmask)];
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    return maxcso.decompress({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
    });
  }
}
