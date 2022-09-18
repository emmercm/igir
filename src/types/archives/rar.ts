import { promises as fsPromises } from 'fs';
import unrar from 'node-unrar-js';
import path from 'path';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
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
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempDir = await fsPromises.mkdtemp(Constants.GLOBAL_TEMP_DIR);
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

    try {
      return await callback(localFile);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }
}
