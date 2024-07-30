import path from 'node:path';

import maxcso from 'maxcso';

import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Maxcso extends Archive {
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;
    const size = (await maxcso.header(this.getFilePath())).uncompressedSize;
    const crc32 = await maxcso.uncompressedCrc32(this.getFilePath());

    const entry = await ArchiveEntry.entryOf({
      archive: this,
      entryPath,
      size: Number(size),
      crc32,
    }, checksumBitmask);
    console.log(entry);
    return [entry];
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    return maxcso.decompress({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
    });
  }
}
