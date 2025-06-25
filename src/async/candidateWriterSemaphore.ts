import { Semaphore } from 'async-mutex';

import Defaults from '../globals/defaults.js';
import WriteCandidate from '../types/writeCandidate.js';
import ElasticSemaphore from './elasticSemaphore.js';
import KeyedMutex from './keyedMutex.js';

/**
 * A wrapper for an `async-mutex` {@link Semaphore} that limits how many writes can be in progress
 * at once. To be used by {@link CandidateWriter}.
 */
export default class CandidateWriterSemaphore {
  private readonly threadsSemaphore: Semaphore;

  private readonly outputPathsMutex = new KeyedMutex(1000);

  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private readonly filesizeSemaphore = new ElasticSemaphore(
    Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

  private _openLocks = 0;

  constructor(threads: number) {
    this.threadsSemaphore = new Semaphore(threads);
  }

  /**
   * Run some {@link callback}.
   */
  async runExclusive(candidate: WriteCandidate, callback: () => Promise<void>): Promise<void> {
    // First, limit writes by the global max number of threads allowed
    await this.threadsSemaphore.runExclusive(async () => {
      // Then, restrict concurrent writes to the same output paths
      const outputFilePaths = candidate
        .getRomsWithFiles()
        .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath());
      await this.outputPathsMutex.runExclusiveForKeys(outputFilePaths, async () => {
        // Then, limit writing too much data to one disk
        const totalKilobytes =
          candidate
            .getRomsWithFiles()
            .reduce((sum, romWithFiles) => sum + romWithFiles.getInputFile().getSize(), 0) / 1024;
        await this.filesizeSemaphore.runExclusive(async () => {
          this._openLocks += 1;
          await callback();
          this._openLocks -= 1;
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
