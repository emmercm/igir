import path from 'node:path';

import Defaults from '../globals/defaults.js';
import type WriteCandidate from '../types/writeCandidate.js';
import ElasticSemaphore from './elasticSemaphore.js';
import KeyedMutex from './keyedMutex.js';
import MappableSemaphore from './mappableSemaphore.js';

/**
 * A wrapper for an `async-mutex` {@link Semaphore} that limits how many writes can be in progress
 * at once. To be used by {@link CandidateWriter}.
 */
export default class CandidateWriterSemaphore {
  private readonly mappableSemaphore: MappableSemaphore;

  private readonly outputPathsMutex = new KeyedMutex(1000);

  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private readonly filesizeSemaphore = new ElasticSemaphore(
    Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

  private _openLocks = 0;

  constructor(threads: number) {
    this.mappableSemaphore = new MappableSemaphore(threads);
  }

  /**
   * Run some {@link callback}. for every {@link candidates}.
   */
  async map<T>(
    candidates: WriteCandidate[],
    callback: (candidate: WriteCandidate) => Promise<T>,
  ): Promise<T[]> {
    const candidatesSorted = candidates.toSorted((a, b) => {
      // First, prefer candidates with fewer files
      if (a.getRomsWithFiles().length !== b.getRomsWithFiles().length) {
        return a.getRomsWithFiles().length - b.getRomsWithFiles().length;
      }
      // Otherwise, stable sort by name
      return a.getName().localeCompare(b.getName());
    });

    // First, limit writes by the global max number of threads allowed
    return this.mappableSemaphore.map(candidatesSorted, async (candidate: WriteCandidate) => {
      // Then, restrict concurrent writes to the same output paths
      const outputFilePaths = candidate
        .getRomsWithFiles()
        .map((romWithFiles) => path.normalize(romWithFiles.getOutputFile().getFilePath()));
      return await this.outputPathsMutex.runExclusiveForKeys(outputFilePaths, async () => {
        // Then, limit writing too much data to one disk
        const totalKilobytes =
          candidate
            .getRomsWithFiles()
            .reduce((sum, romWithFiles) => sum + romWithFiles.getInputFile().getSize(), 0) / 1024;
        return await this.filesizeSemaphore.runExclusive(async () => {
          this._openLocks += 1;
          const result = await callback(candidate);
          this._openLocks -= 1;
          return result;
        }, totalKilobytes);
      });
    });
  }

  /**
   * Get the number of currently open/acquired locks.
   */
  openLocks(): number {
    return this._openLocks;
  }
}
