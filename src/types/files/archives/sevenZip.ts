import _7z, { Result } from '7zip-min';
import { Mutex } from 'async-mutex';
import path from 'path';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class SevenZip extends Archive {
  // p7zip `7za i`
  // WARNING: tar+compression doesn't work, you'll be left with a tar file output
  static readonly SUPPORTED_EXTENSIONS = [
    '.7z', // 7z
    // '.bz2', '.bzip2', // bzip2
    // '.cab', // cab
    '.gz', '.gzip', // gzip
    // '.lzma', // lzma
    // '.lzma86', // lzma86
    // '.pmd', // ppmd
    '.zip.001', // split
    // '.tar', '.ova', // tar
    // '.xz', // xz
    '.z', // z
    '.zip', '.z01', '.zipx', // zip
    // '.zst', // zstd
    // '.lz4', // lz4
    // '.lz5', // lz5
    // '.liz', // lizard
  ];

  private static readonly LIST_MUTEX = new Mutex();

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new SevenZip(filePath);
  }

  async getArchiveEntries(attempt = 1): Promise<ArchiveEntry<SevenZip>[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     *  it will return no files but also no error. Try to prevent that behavior.
     */
    const filesIn7z = await SevenZip.LIST_MUTEX.runExclusive(
      async () => new Promise<Result[]>((resolve, reject) => {
        _7z.list(this.getFilePath(), (err, result) => {
          if (err) {
            const msg = err.toString()
              .replace(/\n\n+/g, '\n')
              .replace(/^/gm, '   ')
              .trim();
            reject(msg);
          } else {
            // https://github.com/onikienko/7zip-min/issues/70
            resolve(result.filter((entry) => entry.name));
          }
        });
      }),
    );

    /**
     * WARN(cemmer): even with the above mutex, {@link _7z.list} will still sometimes return no
     *  entries. Most archives contain at least one file, so assume this is wrong and attempt
     *  again up to 3 times total.
     */
    if (!filesIn7z.length && attempt < 3) {
      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** (attempt - 1) * 100));
      });
      return this.getArchiveEntries(attempt + 1);
    }

    return Promise.all(filesIn7z
      .filter((result) => !result.attr?.startsWith('D'))
      .map(async (result) => ArchiveEntry.entryOf(
        this,
        result.name,
        parseInt(result.size, 10),
        result.crc,
      )));
  }

  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, '7z'));
    try {
      // https://github.com/onikienko/7zip-min/issues/71
      const tempFile = path.join(tempDir, entryPath);

      await new Promise<void>((resolve, reject) => {
        _7z.unpack(this.getFilePath(), tempDir, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      await fsPoly.mv(tempFile, extractedFilePath);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true, force: true });
    }
  }
}
