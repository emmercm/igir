import { Mutex } from 'async-mutex';

/**
 * Wrapper for `async-mutex` {@link Mutex}es to run code exclusively for a key.
 */
export default class KeyedMutex {
  private readonly keyMutexes = new Map<string, Mutex>();

  private readonly keyMutexesMutex = new Mutex();

  private keyMutexesLru = new Set<string>();

  private readonly maxSize?: number;

  constructor(maxSize?: number) {
    this.maxSize = maxSize;
  }

  /**
   * Run a {@link runnable} exclusively across all keys.
   */
  async runExclusiveGlobally<V>(runnable: () => V | Promise<V>): Promise<V> {
    return this.keyMutexesMutex.runExclusive(runnable);
  }

  /**
   * Run a {@link runnable} exclusively for the given {@link key}.
   */
  async runExclusiveForKey<V>(key: string, runnable: () => V | Promise<V>): Promise<V> {
    const keyMutex = await this.runExclusiveGlobally(() => {
      let mutex = this.keyMutexes.get(key);
      if (mutex === undefined) {
        mutex = new Mutex();
        this.keyMutexes.set(key, mutex);

        // Expire least recently used keys
        [...this.keyMutexesLru]
          .filter((lruKey) => !this.keyMutexes.get(lruKey)?.isLocked())
          .slice(this.maxSize ?? Number.MAX_SAFE_INTEGER)
          .forEach((lruKey) => {
            this.keyMutexes.delete(lruKey);
            this.keyMutexesLru.delete(lruKey);
          });
      }

      // Mark this key as recently used
      this.keyMutexesLru.delete(key);
      this.keyMutexesLru = new Set([key, ...this.keyMutexesLru]);

      return mutex;
    });

    return keyMutex.runExclusive(runnable);
  }
}
