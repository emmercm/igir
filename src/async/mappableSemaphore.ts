import async from 'async';
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
   * Run some {@link callback}. for every {@link values}.
   */
  async map<IN, OUT>(values: IN[], callback: (value: IN) => OUT | Promise<OUT>): Promise<OUT[]> {
    if (values.length === 0) {
      // Don't incur any semaphore overhead
      return [];
    }

    return async.mapLimit(values, Math.floor(this.threads * 1.5), async (value: IN) =>
      this.runExclusive(async () => callback(value)),
    );
  }
}
