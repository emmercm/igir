import path from 'node:path';

import maxcso, { MaxcsoBinaryPreference } from 'maxcso';

import { logger } from '../../../../console/logger.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import type { ChecksumBitmaskValue, ChecksumProps } from '../../fileChecksums.js';
import FileChecksums from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for the maxcso family of compressed disc image formats (CSO, DAX, ZSO).
 */
export default abstract class Maxcso extends Archive {
  /**
   * Returns true: maxcso formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns false: entry paths for maxcso formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  async getArchiveEntries(
    checksumBitmask: ChecksumBitmaskValue,
    callback?: FsReadCallback,
    forceChecksumCalculation = false,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;
    const size = (await maxcso.header(this.getFilePath())).uncompressedSize;

    if (callback) {
      callback(0, Number(size));
    }

    // Read the CRC32 from maxcso if needed
    let uncompressedCrc32: string | undefined;
    if (
      !forceChecksumCalculation &&
      (checksumBitmask === ChecksumBitmask.NONE || checksumBitmask & ChecksumBitmask.CRC32)
    ) {
      uncompressedCrc32 = await maxcso.uncompressedCrc32({
        inputFilename: this.getFilePath(),
        binaryPreference: MaxcsoBinaryPreference.PREFER_PATH_BINARY,
      });
    }

    // Calculate checksums from the file's bytes if needed
    let checksums: ChecksumProps = {};
    if (
      checksumBitmask & ~ChecksumBitmask.CRC32 ||
      (forceChecksumCalculation && checksumBitmask & ChecksumBitmask.CRC32)
    ) {
      checksums = await this.extractEntryToStream('', async (readable) => {
        return await FileChecksums.hashStream(readable, checksumBitmask, callback);
      });
    }
    const { crc32, ...checksumsWithoutCrc } = checksums;

    if (crc32 !== undefined && crc32 !== uncompressedCrc32) {
      logger.warn(
        `${this.getFilePath()}: archive is invalid, maxcso returned the CRC32 ${uncompressedCrc32} but it should be ${crc32}`,
      );
    }

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

  /**
   * Extract the disc image to the given path as an uncompressed ISO.
   */
  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await maxcso.decompress({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      binaryPreference: MaxcsoBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
