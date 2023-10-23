import path from 'node:path';

import { Mutex, Semaphore } from 'async-mutex';

import FsPoly from './polyfill/fsPoly.js';
import File from './types/files/file.js';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that limits how many files can be processed at
 * once per hard drive.
 */
export default class DriveSemaphore {
  private readonly keySemaphores = new Map<string, Semaphore>();

  private readonly keySemaphoresMutex = new Mutex();

  private readonly defaultThreads: number;

  constructor(defaultThreads = 1) {
    this.defaultThreads = defaultThreads;
  }

  /**
   * Run some {@link runnable} for every value in {@link files}.
   */
  async map<K extends File | string, V>(
    files: K[],
    runnable: (file: K) => (V | Promise<V>),
  ): Promise<V[]> {
    const disks = await FsPoly.disks();

    return Promise.all(files.map(async (file) => {
      const filePath = file instanceof File ? file.getFilePath() : file as string;
      const filePathNormalized = filePath.replace(/[\\/]/g, path.sep);

      // Try to get the path of the drive this file is on
      let filePathDisk = disks.find((disk) => filePathNormalized.startsWith(disk)) ?? '';

      if (!filePathDisk) {
        // If a drive couldn't be found, try to parse a samba server name
        const sambaMatches = filePathNormalized.match(/^([\\/]{2}[^\\/]+)/);
        if (sambaMatches !== null) {
          [, filePathDisk] = sambaMatches;
        }
      }

      const keySemaphore = await this.keySemaphoresMutex.runExclusive(async () => {
        if (!this.keySemaphores.has(filePathDisk)) {
          let threads = this.defaultThreads;
          if (await FsPoly.isSamba(filePathDisk)) {
            threads = 1;
          }
          this.keySemaphores.set(filePathDisk, new Semaphore(threads));
        }
        return this.keySemaphores.get(filePathDisk) as Semaphore;
      });

      return keySemaphore.runExclusive(async () => runnable(file));
    }));
  }
}
