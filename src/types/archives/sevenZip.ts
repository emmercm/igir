import _7z, { Result } from '7zip-min';
import { Mutex } from 'async-mutex';
import path from 'path';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class SevenZip extends Archive {
  // p7zip `7za i`
  // WARNING: tar+compression doesn't work, you'll be left with a tar file output
  static readonly SUPPORTED_EXTENSIONS = [
    '.7z', // 7z
    '.bz2', '.bzip2', // bzip2
    '.cab', // cab
    '.gz', '.gzip', // gzip
    '.lzma', // lzma
    '.lzma86', // lzma86
    '.pmd', // ppmd
    '.001', // split
    '.tar', '.ova', // tar
    '.xz', // xz
    '.z', // z
    '.zip', '.z01', '.zipx', // zip
    '.zst', // zstd
    '.lz4', // lz4
    '.lz5', // lz5
    '.liz', // lizard
  ];

  private static readonly LIST_MUTEX = new Mutex();

  async getArchiveEntries(): Promise<ArchiveEntry<SevenZip>[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     * it will return no files but also no error. Try to prevent that behavior.
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
            resolve(result);
          }
        });
      }),
    );
    return Promise.all(filesIn7z
      .filter((result) => !result.attr?.startsWith('D'))
      .map(async (result) => ArchiveEntry.entryOf(
        this,
        result.name,
        parseInt(result.size, 10),
        result.crc,
      )));
  }

  async extractEntryToFile<T>(
    entryPath: string,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      _7z.unpack(this.getFilePath(), tempDir, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return callback(path.join(tempDir, entryPath));
  }
}
