import { Semaphore } from 'async-mutex';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that can have its total increased if a weight
 * exceeds the maximum.
 */
export default class ElasticSemaphore {
  private readonly semaphoreValue: number;

  private readonly semaphore: Semaphore;

  constructor(value: number) {
    this.semaphoreValue = Math.ceil(value);
    this.semaphore = new Semaphore(this.semaphoreValue);
  }

  /**
   * Run some {@link callback} with a required {@link weight}.
   */
  async runExclusive<T>(callback: (value: number) => Promise<T> | T, weight: number): Promise<T> {
    const weightNormalized = Math.max(1, Math.ceil(weight));

    // NOTE(cemmer): this semaphore can take a measurable amount of time to actually call the
    //  callback. This is particularly noticeable when using single threads (e.g. via Async.js).
    //  Try to only use semaphores to traffic cop multiple concurrent threads.
    return this.semaphore.runExclusive(
      callback,
      // If the weight of this call is larger than the max value then just use the max value
      Math.min(weightNormalized, this.semaphoreValue),
    );
  }
}
