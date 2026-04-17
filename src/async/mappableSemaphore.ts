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

    const results = await Promise.allSettled(
      values.map(
        async (value) =>
          await this.runExclusive(async () => {
            // Skip work if a prior callback already failed
            if (firstError !== undefined) {
              throw firstError;
            }
            try {
              return await callback(value);
            } catch (error) {
              const wrappedError = error instanceof Error ? error : new Error(String(error));
              firstError ??= wrappedError;
              this.cancel();
              throw wrappedError;
            }
          }),
      ),
    );

    // Re-throw the first real error after all promises have settled
    if (firstError !== undefined) {
      throw firstError;
    }

    return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  }
}
