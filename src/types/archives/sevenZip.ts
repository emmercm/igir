import _7z, { Result } from '7zip-min';
import { Mutex } from 'async-mutex';
import path from 'path';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class SevenZip extends Archive {
  // p7zip `7za i`
  static readonly SUPPORTED_EXTENSIONS = [
    '.7z', // 7z
    '.bz2', '.bzip2', '.tbz2', '.tbz', // bzip2
    '.cab', // cab
    '.gz', '.gzip', '.tgz', '.tpz', // gzip
    '.lzma', // lzma
    '.lzma86', // lzma86
    '.pmd', // ppmd
    '.001', // split
    '.tar', '.ova', // tar
    '.xz', '.txz', // xz
    '.z', '.taz', // z
    '.zip', '.z01', '.zipx', // zip
    '.zst', '.tzstd', // zstd
    '.lz4', '.tlz4', // lz4
    '.lz5', '.tlz5', // lz5
    '.liz', '.tliz', // lizard
  ];

  private static readonly LIST_MUTEX = new Mutex();

  async getArchiveEntries(): Promise<ArchiveEntry<SevenZip>[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     * it will return no files but also no error. Try to prevent that behavior.
     */
    const filesIn7z = await SevenZip.LIST_MUTEX.runExclusive(
      async () => new Promise<Result[]>((resolve, reject) => {
        _7z.list(this.getFilePath(), async (err, result) => {
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
    return filesIn7z
      .filter((result) => !result.attr.startsWith('D'))
      .map((result) => new ArchiveEntry(
        this,
        result.name,
        parseInt(result.size, 10),
        result.crc,
      ));
  }

  async extractEntryToFile<T>(
    archiveEntry: ArchiveEntry<SevenZip>,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath().replace(/[\\/]/g, '/'));

    await new Promise<void>((resolve, reject) => {
      _7z.unpack(this.getFilePath(), tempDir, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return callback(localFile);
  }
}
