import path from 'node:path';

import dolphinTool, { ContainerFormat, DolphinToolBinaryPreference } from 'dolphin-tool';

import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

export default abstract class Dolphin extends Archive {
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Archive>[]> {
    const entryPath = `${path.parse(this.getFilePath()).name}.iso`;

    const digests = await dolphinTool.verify({
      inputFilename: this.getFilePath(),
      binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
    });

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath,
          size: 0, // dolphin-tool doesn't have a way to get size
          crc32: digests.crc32,
          md5: digests.md5,
          sha1: digests.sha1,
        },
        checksumBitmask,
      ),
    ];
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    await dolphinTool.convert({
      inputFilename: this.getFilePath(),
      outputFilename: extractedFilePath,
      containerFormat: ContainerFormat.ISO,
      binaryPreference: DolphinToolBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
