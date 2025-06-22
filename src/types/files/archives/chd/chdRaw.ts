import path from 'node:path';

import chdman, { ChdmanBinaryPreference, CHDType } from 'chdman';

import { ChecksumBitmask, ChecksumBitmaskValue } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';

export default class ChdRaw extends Chd {
  protected new(filePath: string): Archive {
    return new ChdRaw(filePath);
  }

  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    const info = await this.getInfo();
    if (info.type === CHDType.CD_ROM || info.type === CHDType.GD_ROM) {
      return [];
    }

    // MAME DAT <disk>s use the data+metadata SHA1 (vs. just the data SHA1)
    const rawEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: path.parse(this.getFilePath()).name,
        sha1: info.sha1,
        // There isn't a way for us to calculate these other checksums, so fill it in with garbage
        size: 0,
        crc32: checksumBitmask & ChecksumBitmask.CRC32 ? 'x'.repeat(8) : undefined,
        md5: checksumBitmask & ChecksumBitmask.MD5 ? 'x'.repeat(32) : undefined,
        sha256: checksumBitmask & ChecksumBitmask.SHA256 ? 'x'.repeat(64) : undefined,
      },
      checksumBitmask,
    );

    const extractedEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: path.parse(this.getFilePath()).name,
        size: info.logicalSize,
        /**
         * NOTE(cemmer): the "data SHA1" equals the original input file in these tested cases:
         *  - PSP .iso -> .chd with createdvd (and NOT createcd)
         */
        sha1: info.dataSha1,
      },
      checksumBitmask,
    );

    return [rawEntry, extractedEntry];
  }

  async extractArchiveEntries(outputDirectory: string): Promise<string[]> {
    const outputFilename = path.join(outputDirectory, path.parse(this.getFilePath()).name);

    const info = await this.getInfo();
    if (info.type === CHDType.RAW) {
      await chdman.extractRaw({
        inputFilename: this.getFilePath(),
        outputFilename,
        binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
      });
    } else if (info.type === CHDType.HARD_DISK) {
      await chdman.extractHd({
        inputFilename: this.getFilePath(),
        outputFilename,
        binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
      });
    } else if (info.type === CHDType.DVD_ROM) {
      await chdman.extractDvd({
        inputFilename: this.getFilePath(),
        outputFilename,
        binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
      });
    } else {
      return [];
    }

    return [outputFilename];
  }
}
