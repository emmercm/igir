import unrar from 'node-unrar-js';
import path from 'path';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Rar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.rar'];

  async getArchiveEntries(): Promise<ArchiveEntry[]> {
    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
    });
    return [...rar.getFileList().fileHeaders]
      .map((fileHeader) => new ArchiveEntry(
        this,
        fileHeader.name,
        fileHeader.crc.toString(16),
      ));
  }

  async extractEntry<T>(
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath() as string);

    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
      targetPath: tempDir,
    });
    // For whatever reason, the library author decided to delay extraction until the file is
    // iterated, so we have to execute this expression, but can throw away the results
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    [...rar.extract({
      files: [archiveEntry.getEntryPath()],
    }).files];

    return callback(localFile);
  }
}
