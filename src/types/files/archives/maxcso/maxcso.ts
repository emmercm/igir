import path from 'node:path';

import maxcso, { MaxcsoBinaryPreference } from 'maxcso';

import type { FsReadCallback } from '../../../../polyfill/fsReadTransform.js';
import type { ChecksumBitmaskValue, ChecksumProps } from '../../fileChecksums.js';
import FileChecksums from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Maxcso extends Archive {
  canExtract(): boolean {
    return true;
  }

  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  async getArchiveEntries(
    checksumBitmask: ChecksumBitmaskValue,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;
    const size = (await maxcso.header(this.getFilePath())).uncompressedSize;

    if (callback) {
      callback(0, Number(size));
    }

    let uncompressedCrc32: string | undefined;
    if (checksumBitmask === ChecksumBitmask.NONE || checksumBitmask & ChecksumBitmask.CRC32) {
      uncompressedCrc32 = await maxcso.uncompressedCrc32({
        inputFilename: this.getFilePath(),
        binaryPreference: MaxcsoBinaryPreference.PREFER_BUNDLED_BINARY,
      });
    }

    // Calculate non-CRC32 checksums if needed
    let checksums: ChecksumProps = {};
    if (checksumBitmask & ~ChecksumBitmask.CRC32) {
      checksums = await this.extractEntryToStream('', async (readable) => {
        return await FileChecksums.hashStream(readable, checksumBitmask, callback);
      });
    }
    const { crc32, ...checksumsWithoutCrc } = checksums;

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: Number(size),
          crc32: crc32 ?? uncompressedCrc32,
          ...checksumsWithoutCrc,
        },
        checksumBitmask,
      ),
    ];
  }

  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await maxcso.decompress({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      binaryPreference: MaxcsoBinaryPreference.PREFER_BUNDLED_BINARY,
    });
  }
}
