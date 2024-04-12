import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import * as zlib from 'node:zlib';

import { Mutex } from 'async-mutex';

import FsPoly from '../polyfill/fsPoly.js';
import Timer from '../timer.js';

interface CacheData {
  data: string,
}

export interface CacheProps {
  filePath?: string,
  fileFlushMillis?: number,
  saveOnExit?: boolean,
  maxSize?: number,
}

/**
 * A cache of a fixed size that ejects the oldest inserted key.
 */
export default class Cache<V> {
  private static readonly BUFFER_ENCODING: BufferEncoding = 'binary';

  private keyOrder: Set<string> = new Set();

  private keyValues = new Map<string, V>();

  private readonly keyMutexes = new Map<string, Mutex>();

  private readonly keyMutexesMutex = new Mutex();

  private hasChanged: boolean = false;

  private saveToFileTimeout?: Timer;

  readonly filePath?: string;

  readonly fileFlushMillis?: number;

  readonly maxSize?: number;

  constructor(props?: CacheProps) {
    this.filePath = props?.filePath;
    this.fileFlushMillis = props?.fileFlushMillis;
    if (props?.saveOnExit) {
      // WARN: Jest won't call this: https://github.com/jestjs/jest/issues/10927
      process.once('beforeExit', this.save);
    }
    this.maxSize = props?.maxSize;
  }

  /**
   * Return if a key exists in the cache, waiting for any existing operations to complete first.
   */
  public async has(key: string): Promise<boolean> {
    return this.lockKey(key, () => this.keyValues.has(key));
  }

  /**
   * Return all the keys that exist in the cache.
   */
  public keys(): Set<string> {
    return new Set(this.keyValues.keys());
  }

  /**
   * Return the count of keys in the cache.
   */
  public size(): number {
    return this.keyValues.size;
  }

  /**
   * Get the value of a key in the cache, waiting for any existing operations to complete first.
   */
  public async get(key: string): Promise<V | undefined> {
    return this.lockKey(key, () => this.keyValues.get(key));
  }

  /**
   * Get the value of a key in the cache if it exists, or compute a value and set it in the cache
   * otherwise.
   */
  public async getOrCompute(
    key: string,
    runnable: (key: string) => V | Promise<V>,
    shouldRecompute?: (value: V) => boolean | Promise<boolean>,
  ): Promise<V> {
    return this.lockKey(key, async () => {
      if (this.keyValues.has(key)) {
        const existingValue = this.keyValues.get(key) as V;
        if (shouldRecompute === undefined || !await shouldRecompute(existingValue)) {
          return existingValue;
        }
      }

      const val = await runnable(key);
      this.setUnsafe(key, val);
      return val;
    });
  }

  /**
   * Set the value of a key in the cache.
   */
  public async set(key: string, val: V): Promise<void> {
    return this.lockKey(key, () => this.setUnsafe(key, val));
  }

  private setUnsafe(key: string, val: V): void {
    if (this.maxSize !== undefined && !this.keyValues.has(key)) {
      this.keyOrder.add(key);
    }
    this.keyValues.set(key, val);
    this.saveWithTimeout();

    // Evict old values (FIFO)
    if (this.maxSize !== undefined && this.keyValues.size > this.maxSize) {
      const staleKey = this.keyOrder.keys().next().value;
      this.deleteUnsafe(staleKey);
    }
  }

  /**
   * Delete a key in the cache.
   */
  public async delete(key: string | RegExp): Promise<void> {
    let keys: string[];
    if (key instanceof RegExp) {
      keys = [...this.keys().keys()].filter((k) => k.match(key));
    } else {
      keys = [key];
    }

    await Promise.all(keys.map(async (k) => {
      await this.lockKey(k, () => this.deleteUnsafe(k));
    }));
  }

  private deleteUnsafe(key: string): void {
    this.keyOrder.delete(key);
    this.keyValues.delete(key);
    this.keyMutexes.delete(key);
    this.saveWithTimeout();
  }

  private async lockKey<R>(key: string, runnable: () => (R | Promise<R>)): Promise<R> {
    // Get a mutex for `key`
    const keyMutex = await this.keyMutexesMutex.runExclusive(() => {
      if (!this.keyMutexes.has(key)) {
        this.keyMutexes.set(key, new Mutex());
      }
      return this.keyMutexes.get(key) as Mutex;
    });

    // Only allow one concurrent fetch/compute for `key`
    return keyMutex.runExclusive(async () => runnable());
  }

  /**
   * Load the cache from a file.
   */
  public async load(): Promise<Cache<V>> {
    if (this.filePath === undefined || !await FsPoly.exists(this.filePath)) {
      // Cache doesn't exist, so there is nothing to load
      return this;
    }

    try {
      const cacheData = JSON.parse(
        await fs.promises.readFile(this.filePath, { encoding: Cache.BUFFER_ENCODING }),
      ) as CacheData;
      const compressed = Buffer.from(cacheData.data, Cache.BUFFER_ENCODING);
      const decompressed = await util.promisify(zlib.inflate)(compressed);
      const keyValuesObject = JSON.parse(decompressed.toString(Cache.BUFFER_ENCODING));
      const keyValuesEntries = Object.entries(keyValuesObject) as [string, V][];
      this.keyValues = new Map(keyValuesEntries);
      if (this.maxSize !== undefined) {
        this.keyOrder = new Set(Object.keys(keyValuesObject));
      }
    } catch { /* empty */ }

    return this;
  }

  private saveWithTimeout(): void {
    this.hasChanged = true;
    if (this.filePath === undefined
      || this.fileFlushMillis === undefined
      || this.saveToFileTimeout !== undefined
    ) {
      return;
    }

    this.saveToFileTimeout = Timer.setTimeout(async () => this.save(), this.fileFlushMillis);
  }

  /**
   * Save the cache to a file.
   */
  public async save(): Promise<void> {
    // Clear any existing timeout
    if (this.saveToFileTimeout !== undefined) {
      this.saveToFileTimeout.cancel();
      this.saveToFileTimeout = undefined;
    }

    if (this.filePath === undefined || !this.hasChanged) {
      return;
    }

    const keyValuesObject = Object.fromEntries(this.keyValues);
    const decompressed = JSON.stringify(keyValuesObject);
    const compressed = await util.promisify(zlib.deflate)(decompressed);
    const cacheData = {
      data: compressed.toString(Cache.BUFFER_ENCODING),
    } satisfies CacheData;

    // Ensure the directory exists
    const dirPath = path.dirname(this.filePath);
    if (!await FsPoly.exists(dirPath)) {
      await FsPoly.mkdir(dirPath, { recursive: true });
    }

    // Write to a temp file first, then overwrite the old cache file
    const tempFile = await FsPoly.mktemp(this.filePath);
    await FsPoly.writeFile(
      tempFile,
      JSON.stringify(cacheData),
      { encoding: Cache.BUFFER_ENCODING },
    );
    await FsPoly.mv(tempFile, this.filePath);
    this.hasChanged = false;
  }
}
