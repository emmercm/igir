import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import * as zlib from 'node:zlib';

import { Mutex } from 'async-mutex';

import FsPoly from '../polyfill/fsPoly.js';

interface CacheData {
  data: string,
}

export interface CacheProps {
  maxSize?: number,
}

/**
 * A cache of a fixed size that ejects the oldest inserted key.
 */
export default class Cache<V> implements CacheProps {
  private static readonly BUFFER_ENCODING: BufferEncoding = 'binary';

  private keyOrder: Set<string> = new Set();

  private keyValues = new Map<string, V>();

  private readonly keyMutexes = new Map<string, Mutex>();

  private readonly keyMutexesMutex = new Mutex();

  private saveToFileTimeout?: NodeJS.Timeout;

  readonly maxSize?: number;

  constructor(props?: CacheProps) {
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
  public async getOrCompute(key: string, runnable: (key: string) => (V | Promise<V>)): Promise<V> {
    return this.lockKey(key, async () => {
      if (this.keyValues.has(key)) {
        return this.keyValues.get(key) as V;
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

    // Evict old values (FIFO)
    if (this.maxSize !== undefined && this.keyValues.size > this.maxSize) {
      const staleKey = this.keyOrder.keys().next().value;
      this.keyOrder.delete(staleKey);
      this.keyValues.delete(staleKey);
      this.keyMutexes.delete(staleKey);
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
   * TODO
   */
  public async load(filePath: string): Promise<void> {
    const cacheData = JSON.parse(
      await util.promisify(fs.readFile)(filePath, { encoding: Cache.BUFFER_ENCODING }),
    ) as CacheData;
    const compressed = Buffer.from(cacheData.data, Cache.BUFFER_ENCODING);
    const decompressed = await util.promisify(zlib.inflate)(compressed);
    const keyValuesObject = JSON.parse(decompressed.toString(Cache.BUFFER_ENCODING));
    const keyValuesEntries = Object.entries(keyValuesObject) as [string, V][];
    this.keyValues = new Map(keyValuesEntries);
    if (this.maxSize !== undefined) {
      this.keyOrder = new Set(Object.keys(keyValuesObject));
    }
  }

  /**
   * TODO
   */
  public async save(filePath: string): Promise<void> {
    // Clear any existing timeout
    if (this.saveToFileTimeout !== undefined) {
      clearTimeout(this.saveToFileTimeout);
      this.saveToFileTimeout = undefined;
    }

    const keyValuesObject = Object.fromEntries(this.keyValues);
    const decompressed = JSON.stringify(keyValuesObject);
    const compressed = await util.promisify(zlib.deflate)(decompressed);
    const cacheData = {
      data: compressed.toString(Cache.BUFFER_ENCODING),
    } satisfies CacheData;

    // Ensure the directory exists
    const dirPath = path.dirname(filePath);
    if (!await FsPoly.exists(dirPath)) {
      await FsPoly.mkdir(dirPath, { recursive: true });
    }

    // Write to a temp file first, then overwrite the old cache file
    const tempFile = await FsPoly.mktemp(filePath);
    await util.promisify(fs.writeFile)(
      tempFile,
      JSON.stringify(cacheData),
      { encoding: Cache.BUFFER_ENCODING },
    );
    await FsPoly.mv(tempFile, filePath);
  }
}
