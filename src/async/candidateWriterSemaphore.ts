import path from 'node:path';

import type WriteCandidate from '../types/writeCandidate.js';
import KeyedMutex from './keyedMutex.js';
import MappableSemaphore from './mappableSemaphore.js';

/**
 * A wrapper for an `async-mutex` {@link Semaphore} that limits how many writes can be in progress
 * at once. To be used by {@link CandidateWriter}.
 */
export default class CandidateWriterSemaphore {
  private readonly mappableSemaphore: MappableSemaphore;

  private readonly outputPathsMutex = new KeyedMutex(1000);

  constructor(threads: number) {
    this.mappableSemaphore = new MappableSemaphore(threads);
  }

  /**
   * Return the number of currently active candidate write operations.
   */
  openLocks(): number {
    return this.mappableSemaphore.openLocks();
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
    return await this.mappableSemaphore.map(candidatesSorted, async (candidate: WriteCandidate) => {
      // Then, restrict concurrent writes to the same output paths
      const outputFilePaths = candidate
        .getRomsWithFiles()
        .map((romWithFiles) => path.normalize(romWithFiles.getOutputFile().getFilePath()));
      return await this.outputPathsMutex.runExclusiveForKeys(outputFilePaths, async () => {
        return await callback(candidate);
      });
    });
  }
}
