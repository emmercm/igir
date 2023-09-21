import { Mutex, Semaphore } from 'async-mutex';

/**
 * Wrapper for an `async-mutex` {@link Semaphore} that can have its total increased if a weight
 * exceeds the maximum.
 */
export default class ElasticSemaphore {
  private readonly valueMutex = new Mutex();

  private value: number;

  private readonly semaphore: Semaphore;

  constructor(value: number) {
    this.value = Math.ceil(value);
    this.semaphore = new Semaphore(this.value);
  }

  /**
   * Run some {@link callback} with a required {@link weight}.
   */
  async runExclusive<T>(callback: (value: number) => Promise<T> | T, weight: number): Promise<T> {
    const weightNormalized = Math.max(1, Math.ceil(weight));

    // If the weight of this call isn't even 1% of the max value then don't incur the overhead
    //  of a semaphore
    if ((weightNormalized / this.value) * 100 < 1) {
      return callback(this.semaphore.getValue());
    }

    // If the weight of this call is larger than the max value then we need to increase the max
    if (weightNormalized > this.value) {
      await this.valueMutex.runExclusive(() => {
        const increase = weightNormalized - this.value;
        if (increase <= 0) {
          // A competing runnable already increased this semaphore's value
          return;
        }
        this.semaphore.setValue(this.semaphore.getValue() + increase);
        this.value += increase;
      });
    }

    // NOTE(cemmer): this semaphore can take a measurable amount of time to actually call the
    //  callback. This is particularly noticeable when using single threads (e.g. via Async.js).
    //  Try to only use semaphores to traffic cop multiple concurrent threads.
    return this.semaphore.runExclusive(callback, weightNormalized);
  }
}
