import unrar from 'node-unrar-js';
import path from 'path';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Rar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.rar'];

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Rar(filePath);
  }

  async getArchiveEntries(): Promise<ArchiveEntry<Rar>[]> {
    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
    });
    return Promise.all([...rar.getFileList().fileHeaders]
      .filter((fileHeader) => !fileHeader.flags.directory)
      .map(async (fileHeader) => ArchiveEntry.entryOf(
        this,
        fileHeader.name,
        fileHeader.unpSize,
        fileHeader.crc.toString(16),
      )));
  }

  async extractEntryToFile<T>(
    entryPath: string,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, entryPath);

    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
      targetPath: tempDir,
    });
    // For whatever reason, the library author decided to delay extraction until the file is
    // iterated, so we have to execute this expression, but can throw away the results
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    [...rar.extract({
      files: [entryPath.replace(/[\\/]/g, '/')],
    }).files];

    return callback(localFile);
  }
}
