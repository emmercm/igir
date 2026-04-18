import KeyedMutex from './keyedMutex.js';

/**
 * A wrapper for a {@link KeyedMutex} that coordinates input files being moved. To be used by
 * {@link CandidateWriter}.
 */
export default class FileMoveMutex extends KeyedMutex {
  private readonly movedFiles = new Map<string, string>();

  /**
   * Lock an input file for the duration of a move, and remember where it was moved to.
   */
  async moveFile<V>(
    inputFilePath: string,
    runnable: (
      movedFile: string | undefined,
    ) => [V, string | undefined] | Promise<[V, string | undefined]>,
  ): Promise<V> {
    return await this.runExclusiveForKey(inputFilePath, async () => {
      const movedFile = this.movedFiles.get(inputFilePath);
      const [result, outputFilePath] = await runnable(movedFile);
      if (outputFilePath !== undefined) {
        // We are explicitly NOT checking `outputFilePath !== inputFilePath`, as input files that
        // are already in the correct location should be considered "moved" so that if they're used
        // as an input for another Game/ROM they get copied
        this.movedFiles.set(inputFilePath, outputFilePath);
      }
      return result;
    });
  }

  /**
   * Return the new location if an input file was previously moved, without waiting on any
   * in-progress moves.
   */
  getMovedLocationUnsafe(filePath: string): string | undefined {
    return this.movedFiles.get(filePath);
  }
}
