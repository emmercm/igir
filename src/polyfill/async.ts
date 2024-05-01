import { Semaphore } from 'async-mutex';

export default {
  async eachLimit<T>(
    arr: T[],
    limit: number,
    iterator: (val: T) => void | Promise<void>,
  ): Promise<void> {
    const semaphore = new Semaphore(limit);
    await Promise.all(
      arr.map(async (val) => semaphore.runExclusive(async () => iterator(val))),
    );
  },

  async mapLimit<T, R>(
    arr: T[],
    limit: number,
    iterator: (val: T) => R | Promise<R>,
  ): Promise<R[]> {
    const semaphore = new Semaphore(limit);
    return Promise.all(
      arr.map(async (val) => semaphore.runExclusive(async () => iterator(val))),
    );
  },
};
