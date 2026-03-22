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

    return await async.mapLimit(
      values,
      Math.floor(this.threads * 1.5),
      async (value: IN) => await this.runExclusive(async () => await callback(value)),
    );
  }
}
