import path from 'node:path';

import async, { AsyncResultCallback } from 'async';
import { Mutex, Semaphore } from 'async-mutex';

import Constants from './constants.js';
import FsPoly from './polyfill/fsPoly.js';
import File from './types/files/file.js';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that limits how many files can be processed at
 * once per hard drive.
 */
export default class DriveSemaphore {
  private readonly keySemaphores = new Map<string, Semaphore>();

  private readonly keySemaphoresMutex = new Mutex();

  private readonly threads: number;

  private readonly threadsSemaphore: Semaphore;

  constructor(threads = 1) {
    this.threads = threads;
    this.threadsSemaphore = new Semaphore(threads);
  }

  /**
   * Run some {@link runnable} for every value in {@link files}.
   */
  async map<K extends File | string, V>(
    files: K[],
    runnable: (file: K) => (V | Promise<V>),
  ): Promise<V[]> {
    const disks = FsPoly.disksSync();

    // Limit the number of ongoing threads to something reasonable
    return async.mapLimit(
      files,
      Constants.MAX_FS_THREADS,
      async (file, callback: AsyncResultCallback<V, Error>) => {
        try {
          const val = await this.processFile(file, runnable, disks);
          callback(undefined, val);
        } catch (error) {
          if (error instanceof Error) {
            callback(error);
          } else if (typeof error === 'string') {
            callback(new Error(error));
          } else {
            callback(new Error('failed to execute runnable'));
          }
        }
      },
    );
  }

  private async processFile<K extends File | string, V>(
    file: K,
    runnable: (file: K) => (V | Promise<V>),
    disks: string[],
  ): Promise<V> {
    const filePath = file instanceof File ? file.getFilePath() : file as string;
    const filePathNormalized = filePath.replace(/[\\/]/g, path.sep);
    const filePathResolved = path.resolve(filePathNormalized);

    // Try to get the path of the drive this file is on
    let filePathDisk = disks.find((disk) => filePathResolved.startsWith(disk)) ?? '';

    if (!filePathDisk) {
      // If a drive couldn't be found, try to parse a samba server name
      const sambaMatches = filePathNormalized.match(/^([\\/]{2}[^\\/]+)/);
      if (sambaMatches !== null) {
        [, filePathDisk] = sambaMatches;
      }
    }

    const keySemaphore = await this.keySemaphoresMutex.runExclusive(() => {
      if (!this.keySemaphores.has(filePathDisk)) {
        let { threads } = this;
        if (FsPoly.isSamba(filePathDisk)) {
          // Forcefully limit the number of files to be processed concurrently from a single
          // Samba network share
          threads = 1;
        }
        this.keySemaphores.set(filePathDisk, new Semaphore(threads));
      }
      return this.keySemaphores.get(filePathDisk) as Semaphore;
    });

    // First, limit the number of threads per drive, which will better balance the processing of
    // files on different drives vs. processing files sequentially
    return keySemaphore.runExclusive(
      // Second, limit the overall number of threads
      async () => this.threadsSemaphore.runExclusive(
        async () => runnable(file),
      ),
    );
  }
}
