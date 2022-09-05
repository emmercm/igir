import { promises as fsPromises } from 'fs';
import unrar from 'node-unrar-js';
import path from 'path';

import fsPoly from '../../polyfill/fsPoly.js';
import Archive from './archive.js';

export default class Rar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.rar'];

  async listAllEntryPaths(): Promise<Archive[]> {
    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
    });
    return [...rar.getFileList().fileHeaders]
      .map((fileHeader) => new Rar(
        this.getFilePath(),
        fileHeader.name,
        fileHeader.crc.toString(16),
      ));
  }

  async extract(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void> {
    const tempDir = await fsPromises.mkdtemp(globalTempDir);
    const localFile = path.join(tempDir, this.getArchiveEntryPath() as string);

    const rar = await unrar.createExtractorFromFile({
      filepath: this.getFilePath(),
      targetPath: tempDir,
    });
    // For whatever reason, the library author decided to delay extraction until the file is
    // iterated, so we have to execute this expression, but can throw away the results
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    [...rar.extract({
      files: [this.getArchiveEntryPath() as string],
    }).files];

    try {
      await callback(localFile);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }
}
