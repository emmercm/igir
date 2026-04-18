import { Mutex } from 'async-mutex';

import ArrayPoly from '../polyfill/arrayPoly.js';

/**
 * Wrapper for `async-mutex` {@link Mutex}es to run code exclusively for a key.
 */
export default class KeyedMutex {
  private readonly keyMutexes = new Map<string, Mutex>();

  private readonly keyMutexesMutex = new Mutex();

  // ES2015/ES6 maps are required to maintain insertion order, making them inexpensive for LRU
  private readonly keyMutexesLru = new Map<string, undefined>();

  private readonly maxSize?: number;

  constructor(maxSize?: number) {
    this.maxSize = maxSize;
  }

  /**
   * Run a {@link runnable} exclusively across all keys.
   */
  async runExclusiveGlobally<V>(runnable: () => V | Promise<V>): Promise<V> {
    return await this.keyMutexesMutex.runExclusive(runnable);
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

    // Sort keys to impose a canonical acquisition order across all callers. Combined with the
    // sequential acquire loop below, this makes multi-key deadlock impossible: no caller can hold
    // a key greater than one it is still waiting on, so no circular wait can form.
    const uniqueKeys = keys.reduce(ArrayPoly.reduceUnique(), []).toSorted();

    let mutexes: Mutex[];

    if (uniqueKeys.every((key) => this.keyMutexes.has(key))) {
      // If every key mutex already exists, then we can avoid a global lock

      // Note: no new key mutexes were created, so no LRU eviction is necessary
      // Mark all keys as recently used
      for (const key of uniqueKeys) {
        this.keyMutexesLru.delete(key);
        this.keyMutexesLru.set(key, undefined);
      }

      mutexes = uniqueKeys.map((key) => this.keyMutexes.get(key) as Mutex);
    } else {
      // If at least one key mutex does not exist, then we have to take a global lock to create them
      const uniqueKeySet = new Set(uniqueKeys);
      mutexes = await this.keyMutexesMutex.runExclusive(() => {
        for (const key of uniqueKeys) {
          if (!this.keyMutexes.has(key)) {
            this.keyMutexes.set(key, new Mutex());
          }
        }

        // Expire least recently used keys
        if (this.maxSize !== undefined && this.keyMutexes.size > this.maxSize) {
          let keysToEvict = this.keyMutexes.size - this.maxSize;
          for (const lruKey of this.keyMutexesLru.keys()) {
            if (keysToEvict <= 0) {
              break;
            }
            if (!uniqueKeySet.has(lruKey) && !this.keyMutexes.get(lruKey)?.isLocked()) {
              this.keyMutexes.get(lruKey)?.release();
              this.keyMutexes.delete(lruKey);
              this.keyMutexesLru.delete(lruKey);
              keysToEvict--;
            }
          }
        }

        // Mark all keys as recently used
        for (const key of uniqueKeys) {
          this.keyMutexesLru.delete(key);
          this.keyMutexesLru.set(key, undefined);
        }

        return uniqueKeys.map((key) => this.keyMutexes.get(key) as Mutex);
      });
    }

    for (const mutex of mutexes) {
      await mutex.acquire();
    }
  }

  /**
   * Release any held lock for the given key.
   */
  release(key: string): void {
    this.releaseMultiple([key]);
  }

  /**
   * Release any held lock for the given keys.
   */
  releaseMultiple(keys: string[]): void {
    if (keys.length === 0) {
      return;
    }

    keys.reduce(ArrayPoly.reduceUnique(), []).forEach((key) => {
      this.keyMutexes.get(key)?.release();
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
      this.release(key);
    }
  }

  /**
   * Run a {@link runnable} exclusively for the given {@link keys}. Keys are acquired in canonical
   * sorted order and released after {@link runnable} completes, so concurrent callers cannot
   * deadlock regardless of the order in which they pass their keys.
   */
  async runExclusiveForKeys<V>(keys: string[], runnable: () => V | Promise<V>): Promise<V> {
    await this.acquireMultiple(keys);
    try {
      return await runnable();
    } finally {
      this.releaseMultiple(keys);
    }
  }
}
