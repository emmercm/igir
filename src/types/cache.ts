import { Mutex } from 'async-mutex';

export default class Cache<K, V> {
  private readonly keyOrder: K[] = [];

  private readonly keyValues = new Map<K, V>();

  private readonly keyMutexes = new Map<K, Mutex>();

  private readonly keyMutexesMutex = new Mutex();

  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  public async getOrCompute(key: K, runnable: () => (V | Promise<V>)): Promise<V> {
    // Get a mutex for `key`
    const keyMutex = await this.keyMutexesMutex.runExclusive(() => {
      if (!this.keyMutexes.has(key)) {
        this.keyMutexes.set(key, new Mutex());
      }
      return this.keyMutexes.get(key) as Mutex;
    });

    // Only allow one concurrent fetch/compute for `key`
    return keyMutex.runExclusive(async () => {
      if (this.keyValues.has(key)) {
        return this.keyValues.get(key) as V;
      }

      const val = await runnable();
      this.set(key, val);
      return val;
    });
  }

  private set(key: K, val: V): void {
    if (!this.keyValues.has(key)) {
      this.keyOrder.push(key);
    }
    this.keyValues.set(key, val);

    // Delete old values
    if (this.keyValues.size > this.maxSize) {
      const staleKey = this.keyOrder.splice(0, 1)[0];
      this.keyValues.delete(staleKey);
      this.keyMutexes.delete(staleKey);
    }
  }
}
