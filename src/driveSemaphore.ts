import path from 'node:path';

import async, { AsyncResultCallback } from 'async';
import { Mutex, Semaphore } from 'async-mutex';

import ElasticSemaphore from './elasticSemaphore.js';
import Defaults from './globals/defaults.js';
import ArrayPoly from './polyfill/arrayPoly.js';
import FsPoly from './polyfill/fsPoly.js';
import File from './types/files/file.js';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that limits how many files can be processed at
 * once per hard drive.
 */
export default class DriveSemaphore {
  private static readonly DISKS = FsPoly.disksSync();

  private readonly driveSemaphores = new Map<string, ElasticSemaphore>();

  private readonly driveSemaphoresMutex = new Mutex();

  private readonly threadsSemaphore: Semaphore;

  constructor(threads: number) {
    this.threadsSemaphore = new Semaphore(threads);
  }

  getValue(): number {
    return this.threadsSemaphore.getValue();
  }

  setValue(threads: number): void {
    this.threadsSemaphore.setValue(threads);
  }

  /**
   * Run a {@link runnable} for the given {@link file}.
   */
  async runExclusive<V>(
    file: File | string,
    runnable: () => (V | Promise<V>),
  ): Promise<V> {
    const filePathDisk = DriveSemaphore.getDiskForFile(file);
    const driveSemaphore = await this.driveSemaphoresMutex.runExclusive(() => {
      if (!this.driveSemaphores.has(filePathDisk)) {
        // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
        //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
        let maxKilobytes = Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES;

        if (FsPoly.isSamba(filePathDisk)) {
          // Forcefully limit the number of files to be processed concurrently from a single
          // Samba network share
          maxKilobytes = 1;
        }

        this.driveSemaphores.set(filePathDisk, new ElasticSemaphore(maxKilobytes));
      }

      return this.driveSemaphores.get(filePathDisk) as ElasticSemaphore;
    });

    const fileSizeKilobytes = (file instanceof File && file.getSize() > 0
      ? file.getSize()
      : await FsPoly.size(file instanceof File ? file.getFilePath() : file)
    ) / 1024;

    // First, limit the number of threads per drive, which will better balance the processing of
    // files on different drives vs. processing files sequentially
    return driveSemaphore.runExclusive(
      // Second, limit the overall number of threads
      async () => this.threadsSemaphore.runExclusive(
        async () => runnable(),
      ),
      fileSizeKilobytes,
    );
  }

  /**
   * Run some {@link runnable} for every value in {@link files}.
   */
  async map<K extends File | string, V>(
    files: K[],
    runnable: (file: K) => (V | Promise<V>),
  ): Promise<V[]> {
    // Sort the files, then "stripe" them by their disk path for fair processing among disks
    const disksToFiles = files
      .sort()
      .reverse() // so that .pop() below puts files back in their order
      .reduce((map, file) => {
        const key = DriveSemaphore.getDiskForFile(file);
        map.set(key, [...(map.get(key) ?? []), file]);
        return map;
      }, new Map<string, K[]>());
    const maxFilesOnAnyDisk = [...disksToFiles.values()]
      .reduce((max, filesForDisk) => Math.max(max, filesForDisk.length), 0);
    let filesStriped: K[] = [];
    for (let i = 0; i < maxFilesOnAnyDisk; i += 1) {
      const batch = [...disksToFiles.values()]
        .map((filesForDisk) => filesForDisk.pop())
        .filter(ArrayPoly.filterNotNullish);
      filesStriped = [...filesStriped, ...batch];
    }

    // Limit the number of ongoing threads to something reasonable
    return async.mapLimit(
      filesStriped,
      Defaults.MAX_FS_THREADS,
      async (file, callback: AsyncResultCallback<V, Error>) => {
        try {
          const val = await this.runExclusive(file, async () => runnable(file));
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

  private static getDiskForFile(file: File | string): string {
    const filePath = file instanceof File ? file.getFilePath() : file as string;
    const filePathNormalized = filePath.replace(/[\\/]/g, path.sep);
    const filePathResolved = path.resolve(filePathNormalized);

    // Try to get the path of the drive this file is on
    let filePathDisk = this.DISKS.find((disk) => filePathResolved.startsWith(disk)) ?? '';

    if (!filePathDisk) {
      // If a drive couldn't be found, try to parse a samba server name
      const sambaMatches = filePathNormalized.match(/^([\\/]{2}[^\\/]+)/);
      if (sambaMatches !== null) {
        [, filePathDisk] = sambaMatches;
      }
    }

    return filePathDisk;
  }
}
