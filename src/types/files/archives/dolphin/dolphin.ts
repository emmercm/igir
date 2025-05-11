import path from 'node:path';

import dolphinTool, {
  ContainerFormat,
  DigestAlgorithm,
  DolphinToolBinaryPreference,
} from 'dolphin-tool';

import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Dolphin extends Archive {
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;

    const size = await dolphinTool.uncompressedSize(this.getFilePath());

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

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: Number(size),
          crc32: digests.crc32,
          md5: digests.md5,
          sha1: digests.sha1,
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
      binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
