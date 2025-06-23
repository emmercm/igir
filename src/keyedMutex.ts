import { Mutex } from 'async-mutex';

import ArrayPoly from './polyfill/arrayPoly.js';

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
   * Acquire a lock for the given key.
   */
  async acquire(key: string): Promise<void> {
    await this.acquireMultiple([key]);
  }

  /**
   * Acquire a lock for every given key.
   */
  async acquireMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    const mutexes = await this.runExclusiveGlobally(() => {
      const mutexes = keys.reduce(ArrayPoly.reduceUnique(), []).map((key) => {
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
        return mutex;
      });

      // Mark this key as recently used
      for (const key of keys) {
        this.keyMutexesLru.delete(key);
      }
      this.keyMutexesLru = new Set([...keys, ...this.keyMutexesLru]);

      return mutexes;
    });

    await Promise.all(mutexes.map(async (mutex) => mutex.acquire()));
  }

  /**
   * Release any held lock for the given key.
   */
  async release(key: string): Promise<void> {
    await this.releaseMultiple([key]);
  }

  /**
   * Release any held lock for the given keys.
   */
  async releaseMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.runExclusiveGlobally(() => {
      keys.reduce(ArrayPoly.reduceUnique(), []).forEach((key) => {
        const mutex = this.keyMutexes.get(key);
        if (mutex === undefined) {
          return;
        }
        mutex.release();
      });
    });
  }

  /**
   * Run a {@link runnable} exclusively for the given {@link key}.
   */
  async runExclusiveForKey<V>(key: string, runnable: () => V | Promise<V>): Promise<V> {
    await this.acquire(key);
    try {
      return await runnable();
    } finally {
      await this.release(key);
    }
  }

  /**
   * Run a {@link runnable} exclusively for the given {@link keys}. Be wary of deadlocks!
   */
  async runExclusiveForKeys<V>(keys: string[], runnable: () => V | Promise<V>): Promise<V> {
    await this.acquireMultiple(keys);
    try {
      return await runnable();
    } finally {
      await this.releaseMultiple(keys);
    }
  }
}
