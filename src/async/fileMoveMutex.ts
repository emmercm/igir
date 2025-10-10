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
    return this.runExclusiveForKey(inputFilePath, async () => {
      const movedFile = this.movedFiles.get(inputFilePath);
      const [result, outputFilePath] = await runnable(movedFile);
      if (outputFilePath !== undefined && outputFilePath !== inputFilePath) {
        this.movedFiles.set(inputFilePath, outputFilePath);
      }
      return result;
    });
  }

  /**
   * Return if an input file was previously moved.
   */
  async wasMoved(filePath: string): Promise<boolean> {
    // It was definitely moved
    if (this.movedFiles.has(filePath)) {
      return true;
    }

    // It's maybe in the process of moving, so we need to wait
    return this.runExclusiveForKey(filePath, () => {
      return this.movedFiles.has(filePath);
    });
  }
}
