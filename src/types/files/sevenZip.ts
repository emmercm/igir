import _7z, { Result } from '7zip-min';
import { Mutex } from 'async-mutex';
import { promises as fsPromises } from 'fs';
import path from 'path';

import fsPoly from '../../polyfill/fsPoly.js';
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

  async listAllEntryPaths(): Promise<Archive[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     * it will return no files but also no error. Try to prevent that behavior.
     */
    return SevenZip.LIST_MUTEX.runExclusive(async () => {
      const filesIn7z = await new Promise((resolve, reject) => {
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
      }) as Result[];
      return filesIn7z.map((result) => new SevenZip(this.getFilePath(), result.name, result.crc));
    });
  }

  async extract(
    globalTempDir: string,
    callback: (localFile: string) => void | Promise<void>,
  ): Promise<void> {
    const tempDir = await fsPromises.mkdtemp(globalTempDir);
    const localFile = path.join(tempDir, this.getArchiveEntryPath() as string);

    await new Promise<void>((resolve, reject) => {
      _7z.unpack(this.getFilePath(), tempDir, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try {
      await callback(localFile);
    } finally {
      fsPoly.rmSync(tempDir, { recursive: true });
    }
  }
}
