import path from 'node:path';

import dolphinTool, {
  ContainerFormat,
  DigestAlgorithm,
  DolphinToolBinaryPreference,
} from 'dolphin-tool';

import { logger } from '../../../../console/logger.js';
import type { FsReadCallback } from '../../../../streams/fsReadTransform.js';
import type { ChecksumProps } from '../../fileChecksums.js';
import FileChecksums from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * Base class for Dolphin-emulator compressed disc image formats (GCZ, RVZ, WIA).
 */
export default abstract class Dolphin extends Archive {
  /**
   * Returns true: Dolphin formats support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns false: entry paths for Dolphin formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;

    const size = await dolphinTool.uncompressedSize(this.getFilePath());

    if (callback) {
      callback(0, Number(size));
    }

    const digests = await dolphinTool.verify({
      inputFilename: this.getFilePath(),
      binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
    });
    if (checksumBitmask & ChecksumBitmask.MD5) {
      // dolphin-tool only returns CRC32 and SHA1 digests
      digests.md5 = (
        await dolphinTool.verify({
          inputFilename: this.getFilePath(),
          digestAlgorithm: DigestAlgorithm.MD5,
          binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
        })
      ).md5;
    }

    let checksums: ChecksumProps = {};
    if (checksumBitmask & ChecksumBitmask.SHA256) {
      checksums = await this.extractEntryToStream('', async (readable) => {
        return await FileChecksums.hashStream(readable, checksumBitmask, callback);
      });
    }
    const { crc32, md5, sha1, ...checksumsWithoutCrcMd5Sha1 } = checksums;

    if (crc32 !== undefined && crc32 !== digests.crc32) {
      logger.warn(
        `${this.getFilePath()}: archive is invalid, dolphin-tool returned the CRC32 ${digests.crc32} but it should be ${crc32}`,
      );
    } else if (md5 !== undefined && md5 !== digests.md5) {
      logger.warn(
        `${this.getFilePath()}: archive is invalid, dolphin-tool returned the MD5 ${digests.md5} but it should be ${md5}`,
      );
    } else if (sha1 !== undefined && sha1 !== digests.sha1) {
      logger.warn(
        `${this.getFilePath()}: archive is invalid, dolphin-tool returned the SHA1 ${digests.sha1} but it should be ${sha1}`,
      );
    }

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: Number(size),
          crc32: crc32 ?? digests.crc32,
          md5: md5 ?? digests.md5,
          sha1: sha1 ?? digests.sha1,
          ...checksumsWithoutCrcMd5Sha1,
        },
        checksumBitmask,
      ),
    ];
  }

  /**
   * Extract the disc image to the given path as an uncompressed ISO.
   */
  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await dolphinTool.convert({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      containerFormat: ContainerFormat.ISO,
      binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
