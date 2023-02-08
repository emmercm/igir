import { Mutex, Semaphore } from 'async-mutex';

export default class ElasticSemaphore {
  private readonly valueMutex = new Mutex();

  private value: number;

  private readonly semaphore: Semaphore;

  constructor(value: number) {
    this.value = value;
    this.semaphore = new Semaphore(this.value);
  }

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
        this.semaphore.setValue(this.semaphore.getValue() + increase);
        this.value += increase;
      });
    }

    return this.semaphore.runExclusive(callback, weightNormalized);
  }
}
