import type WriteCandidate from '../models/writeCandidate.js';
import KeyedMutex from './keyedMutex.js';
import MappableSemaphore from './mappableSemaphore.js';

/**
 * A {@link MappableSemaphore} that limits how many writes can be in progress at once. To be used
 * by every module that writes files, such as {@link CandidateWriter}.
 */
export default class CandidateWriterSemaphore extends MappableSemaphore {
  private readonly outputPathsMutex = new KeyedMutex(1000);

  /**
   * Run some {@link callback}. for every {@link candidates}, preventing concurrent writes to the
   * same output paths.
   */
  async mapCandidates<T>(
    candidates: WriteCandidate[],
    callback: (candidate: WriteCandidate) => T | Promise<T>,
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
    return await this.map(candidatesSorted, async (candidate: WriteCandidate) => {
      // Then, restrict concurrent writes to the same output paths
      const outputFilePaths = candidate
        .getRomsWithFiles()
        .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath());
      return await this.outputPathsMutex.runExclusiveForKeys(outputFilePaths, async () => {
        return await callback(candidate);
      });
    });
  }
}
