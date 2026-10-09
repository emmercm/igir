import { Semaphore } from 'async-mutex';

/**
 * A wrapper for an `async-mutex` {@link Semaphore} that allows mapping over an array of values.
 */
export default class MappableSemaphore extends Semaphore {
  private readonly threads: number;

  constructor(threads: number) {
    super(threads);
    this.threads = threads;
  }

  /**
   * Return the number of currently held semaphore slots.
   */
  openLocks(): number {
    return this.threads - Math.max(this.getValue(), 0);
  }

  /**
   * Run some {@link callback}. for every {@link values}.
   */
  async map<IN, OUT>(values: IN[], callback: (value: IN) => OUT | Promise<OUT>): Promise<OUT[]> {
    if (values.length === 0) {
      // Don't incur any semaphore overhead
      return [];
    }

    let firstError: Error | undefined;
    const results: Awaited<OUT>[] = [];
    let nextIdx = 0;

    // Use a fixed pool of workers that each take the next value, rather than creating one promise
    // per value, so that at most `threads` waiters are ever queued on the semaphore per call
    const worker = async (): Promise<void> => {
      while (firstError === undefined && nextIdx < values.length) {
        const idx = nextIdx;
        nextIdx += 1;
        await this.runExclusive(async () => {
          // Skip work if a prior callback already failed
          if (firstError !== undefined) {
            return;
          }
          try {
            results[idx] = await callback(values[idx]);
          } catch (error) {
            firstError ??= error instanceof Error ? error : new Error(String(error));
          }
        });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.threads, values.length) }, async () => {
        await worker();
      }),
    );

    // Re-throw the first real error after all in-flight callbacks have finished
    if (firstError !== undefined) {
      throw firstError;
    }

    return results;
  }
}
