import { Mutex } from 'async-mutex';
import unrar from 'node-unrar-js';
import path from 'path';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Rar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.rar'];

  private static readonly EXTRACT_MUTEX = new Mutex();

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
    extractedFilePath: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'rar')); // TODO(cemmer): cleanup
    const tempFile = path.join(tempDir, entryPath);

    /**
     * WARN(cemmer): {@link unrar.extract} seems to have issues with extracting files to different
     * directories at the same time, it will sometimes extract to the wrong directory. Try to
     * prevent that behavior.
     */
    await Rar.EXTRACT_MUTEX.runExclusive(async () => {
      const rar = await unrar.createExtractorFromFile({
        filepath: this.getFilePath(),
        targetPath: tempDir,
        // TODO(cemmer): test
        filenameTransform: (filename) => filename,
      });
      // For whatever reason, the library author decided to delay extraction until the file is
      // iterated, so we have to execute this expression, but can throw away the results
      /* eslint-disable @typescript-eslint/no-unused-expressions */
      [...rar.extract({
        files: [entryPath.replace(/[\\/]/g, '/')],
      }).files];
    });

    // https://github.com/YuJianrong/node-unrar.js/issues/141
    await fsPoly.rename(tempFile, extractedFilePath);

    return callback(extractedFilePath);
  }
}
