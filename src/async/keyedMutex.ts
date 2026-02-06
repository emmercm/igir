import type { MutexInterface } from 'async-mutex';
import { E_TIMEOUT } from 'async-mutex';
import { Mutex, withTimeout } from 'async-mutex';

import ArrayPoly from '../polyfill/arrayPoly.js';

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
          if (this.maxSize !== undefined && this.keyMutexes.size > this.maxSize) {
            [...this.keyMutexesLru]
              .filter((lruKey) => !this.keyMutexes.get(lruKey)?.isLocked())
              .slice(this.maxSize)
              .forEach((lruKey) => {
                this.keyMutexes.get(lruKey)?.release();
                this.keyMutexes.delete(lruKey);
                this.keyMutexesLru.delete(lruKey);
              });
          }
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

    await KeyedMutex.acquireMultipleWithDeadlockProtection(mutexes);
  }

  /**
   * Trying to take multiple locks at once can lead to deadlocking. This is a naive deadlock
   * resolution algorithm that requires all locks to be taken within {@link timeoutMillis}. If any
   * lock can't be taken in the timeout, then any acquired locks will be released and all of them
   * will be tried again. This semi-frequent releasing should help pending lockers make progress.
   *
   * This function will retry forever, which may still cause problems.
   */
  private static async acquireMultipleWithDeadlockProtection(
    mutexes: Mutex[],
    timeoutMillis = process.env.NODE_ENV === 'test' ? 1000 : 15_000,
  ): Promise<void> {
    // Add +/-10% jitter to try to prevent the exact same deadlock from happening
    const timeoutWithJitter =
      timeoutMillis - timeoutMillis * 0.1 + Math.random() * (timeoutMillis * 0.2);
    const mutexesWithTimeout = mutexes.map((mutex) => withTimeout(mutex, timeoutWithJitter));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const mutexesAcquired: MutexInterface[] = [];
      let anyMutexRejected = false;

      const acquirePromises = mutexesWithTimeout.map(async (mutex) => {
        await mutex.acquire();
        if (anyMutexRejected) {
          // One of the mutexes couldn't lock, so we shouldn't keep any others
          mutex.release();
          return;
        }
        mutexesAcquired.push(mutex);
      });

      try {
        await Promise.all(acquirePromises);
        return;
      } catch (error) {
        // Release any mutexes locked, and wait on all pending mutex locks to be resolved
        anyMutexRejected = true;
        mutexesAcquired.forEach((mutex) => {
          mutex.release();
        });
        await Promise.allSettled(acquirePromises);

        if (error !== E_TIMEOUT) {
          // The error was something other than a timeout, throw it
          throw error;
        }

        if (process.env.NODE_ENV === 'test') {
          console.log(
            `acquired only ${mutexesAcquired.length.toLocaleString()}/${mutexes.length.toLocaleString()} in ${timeoutMillis}ms`,
          );
        }
      }
    }
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
        this.keyMutexes.get(key)?.release();
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
