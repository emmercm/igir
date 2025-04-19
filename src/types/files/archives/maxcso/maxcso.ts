import path from 'node:path';

import maxcso, { MaxcsoBinaryPreference } from 'maxcso';

import { ChecksumBitmask, ChecksumBitmaskValue } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Maxcso extends Archive {
  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;
    const size = (await maxcso.header(this.getFilePath())).uncompressedSize;
    let crc32: string | undefined;
    if (checksumBitmask === ChecksumBitmask.NONE || checksumBitmask & ChecksumBitmask.CRC32) {
      crc32 = await maxcso.uncompressedCrc32({
        inputFilename: this.getFilePath(),
        binaryPreference: MaxcsoBinaryPreference.PREFER_PATH_BINARY,
      });
    }

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: Number(size),
          crc32,
        },
        checksumBitmask,
      ),
    ];
  }

  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    return maxcso.decompress({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      binaryPreference: MaxcsoBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
