import path from 'node:path';

import async from 'async';
import { Mutex, Semaphore } from 'async-mutex';

import ElasticSemaphore from './elasticSemaphore.js';
import Defaults from './globals/defaults.js';
import FsPoly from './polyfill/fsPoly.js';
import File from './types/files/file.js';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that limits how many files can be processed at
 * once per hard drive.
 */
export default class DriveSemaphore {
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
   * Run a {@link runnable} exclusively for the given {@link file}.
   */
  async runExclusive<V>(file: File | string, runnable: () => V | Promise<V>): Promise<V> {
    const filePathDisk = DriveSemaphore.getDiskForFile(file);
    const driveSemaphore = await this.driveSemaphoresMutex.runExclusive(() => {
      let semaphore = this.driveSemaphores.get(filePathDisk);
      if (semaphore === undefined) {
        // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
        //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
        let maxKilobytes = Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES;

        if (FsPoly.isSamba(filePathDisk)) {
          // Forcefully limit the number of files to be processed concurrently from a single
          // Samba network share
          maxKilobytes = 1;
        }

        semaphore = new ElasticSemaphore(maxKilobytes);
        this.driveSemaphores.set(filePathDisk, semaphore);
      }

      return semaphore;
    });

    const fileSizeKilobytes =
      (file instanceof File && file.getSize() > 0
        ? file.getSize()
        : await FsPoly.size(file instanceof File ? file.getFilePath() : file)) / 1024;

    // First, limit the number of threads per drive, which will better balance the processing of
    // files on different drives vs. processing files sequentially
    return driveSemaphore.runExclusive(
      // Second, limit the overall number of threads
      async () => this.threadsSemaphore.runExclusive(async () => runnable()),
      fileSizeKilobytes,
    );
  }

  /**
   * Run some {@link runnable} for every value in {@link files}.
   */
  async map<K extends File | string, V>(
    files: K[],
    runnable: (file: K) => V | Promise<V>,
  ): Promise<V[]> {
    // Sort the files, then "stripe" them by their disk path for fair processing among disks
    const disksToFiles = files
      // Remember the original ordering of the files by its index
      .map((file, idx) => [file, idx] satisfies [K, number])
      .sort(([a], [b]) => {
        const aPath = a instanceof File ? a.getFilePath() : a.toString();
        const bPath = b instanceof File ? b.getFilePath() : b.toString();
        return aPath.localeCompare(bPath);
      })
      .reduce((map, [file, idx]) => {
        const key = DriveSemaphore.getDiskForFile(file);
        if (map.has(key)) {
          map.get(key)?.push([file, idx]);
        } else {
          map.set(key, [[file, idx]]);
        }
        return map;
      }, new Map<string, [K, number][]>());
    const maxFilesOnAnyDisk = [...disksToFiles.values()].reduce(
      (max, filesForDisk) => Math.max(max, filesForDisk.length),
      0,
    );
    let filesStriped: [K, number][] = [];
    const chunkSize = 5;
    for (let i = 0; i < maxFilesOnAnyDisk; i += chunkSize) {
      const batch = [...disksToFiles.values()].flatMap((filesForDisk) =>
        filesForDisk.splice(0, chunkSize),
      );
      filesStriped = [...filesStriped, ...batch];
    }

    // Limit the number of ongoing threads to something reasonable
    const results = await async.mapLimit(
      filesStriped,
      Defaults.MAX_FS_THREADS,
      async ([file, idx]: [K, number]): Promise<[V, number]> => {
        try {
          const val = await this.runExclusive(file, async () => runnable(file));
          return [val, idx];
        } catch (error) {
          if (error instanceof Error) {
            throw error;
          } else if (typeof error === 'string') {
            throw new Error(error);
          } else {
            throw new Error('failed to execute runnable');
          }
        }
      },
    );

    // Put the values back in order
    return results.sort(([, aIdx], [, bIdx]) => aIdx - bIdx).map(([result]) => result);
  }

  private static getDiskForFile(file: File | string): string {
    const filePath = file instanceof File ? file.getFilePath() : file;
    const filePathNormalized = filePath.replaceAll(/[\\/]/g, path.sep);

    // Try to get the path of the drive this file is on
    const filePathDisk = FsPoly.diskResolved(filePathNormalized);
    if (filePathDisk !== undefined) {
      return filePathDisk;
    }

    // If a drive couldn't be found, try to parse a samba server name
    const sambaMatches = /^([\\/]{2}[^\\/]+)/.exec(filePathNormalized);
    if (sambaMatches !== null) {
      return sambaMatches[1];
    }

    return '';
  }
}
