import path from 'node:path';

import dolphinTool, {
  ContainerFormat,
  DigestAlgorithm,
  DolphinToolBinaryPreference,
} from 'dolphin-tool';

import type { FsReadCallback } from '../../../../polyfill/fsReadTransform.js';
import type { ChecksumProps } from '../../fileChecksums.js';
import FileChecksums from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Dolphin extends Archive {
  canExtract(): boolean {
    return true;
  }

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
      binaryPreference: DolphinToolBinaryPreference.PREFER_BUNDLED_BINARY,
    });
    if (checksumBitmask & ChecksumBitmask.MD5) {
      // dolphin-tool only returns CRC32 and SHA1 digests
      digests.md5 = (
        await dolphinTool.verify({
          inputFilename: this.getFilePath(),
          digestAlgorithm: DigestAlgorithm.MD5,
          binaryPreference: DolphinToolBinaryPreference.PREFER_BUNDLED_BINARY,
        })
      ).md5;
    }

    const checksums: ChecksumProps = { crc32: digests.crc32, md5: digests.md5, sha1: digests.sha1 };
    if (checksumBitmask & ChecksumBitmask.SHA256) {
      checksums.sha256 = await this.extractEntryToStream('', async (readable) => {
        return (await FileChecksums.hashStream(readable, ChecksumBitmask.SHA256, callback)).sha256;
      });
    }

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: Number(size),
          ...checksums,
        },
        checksumBitmask,
      ),
    ];
  }

  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await dolphinTool.convert({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      containerFormat: ContainerFormat.ISO,
      binaryPreference: DolphinToolBinaryPreference.PREFER_BUNDLED_BINARY,
    });
  }
}
