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
  filePath?: string,
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

  private loadedFromFile = false;

  private saveToFileTimeout?: NodeJS.Timeout;

  readonly filePath?: string;

  readonly maxSize?: number;

  constructor(props?: CacheProps) {
    this.filePath = props?.filePath;
    if (this.filePath) {
      process.once('beforeExit', this.saveToFile);
    }

    this.maxSize = props?.maxSize;
  }

  /**
   * Return if a key exists in the cache, waiting for any existing operations to complete first.
   */
  public async has(key: string): Promise<boolean> {
    await this.loadFromFile(); // lazy load

    return this.lockKey(key, () => this.keyValues.has(key));
  }

  /**
   * Return all the keys that exist in the cache.
   */
  public async keys(): Promise<Set<string>> {
    await this.loadFromFile(); // lazy load

    return new Set(this.keyValues.keys());
  }

  /**
   * Return the count of keys in the cache.
   */
  public async size(): Promise<number> {
    await this.loadFromFile(); // lazy load

    return this.keyValues.size;
  }

  /**
   * Get the value of a key in the cache, waiting for any existing operations to complete first.
   */
  public async get(key: string): Promise<V | undefined> {
    await this.loadFromFile(); // lazy load

    return this.lockKey(key, () => this.keyValues.get(key));
  }

  /**
   * Get the value of a key in the cache if it exists, or compute a value and set it in the cache
   * otherwise.
   */
  public async getOrCompute(key: string, runnable: () => (V | Promise<V>)): Promise<V> {
    await this.loadFromFile(); // lazy load

    return this.lockKey(key, async () => {
      if (this.keyValues.has(key)) {
        return this.keyValues.get(key) as V;
      }

      const val = await runnable();
      this.setUnsafe(key, val);
      return val;
    });
  }

  /**
   * Set the value of a key in the cache.
   */
  public async set(key: string, val: V): Promise<void> {
    await this.loadFromFile(); // lazy load

    return this.lockKey(key, () => this.setUnsafe(key, val));
  }

  private setUnsafe(key: string, val: V): void {
    if (this.maxSize !== undefined && !this.keyValues.has(key)) {
      this.keyOrder.add(key);
    }
    this.keyValues.set(key, val);
    this.scheduleSaveToFile();

    // Evict old values (FIFO)
    if (this.maxSize !== undefined && this.keyValues.size > this.maxSize) {
      const staleKey = this.keyOrder.keys().next().value;
      this.keyOrder.delete(staleKey);
      this.keyValues.delete(staleKey);
      this.keyMutexes.delete(staleKey);
    }
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

  private async loadFromFile(): Promise<void> {
    if (this.loadedFromFile
      || this.filePath === undefined
      || !await FsPoly.exists(this.filePath)
    ) {
      this.loadedFromFile = true;
      return;
    }

    try {
      const cacheData = JSON.parse(
        await util.promisify(fs.readFile)(this.filePath, { encoding: Cache.BUFFER_ENCODING }),
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
    this.loadedFromFile = true;
  }

  private async saveToFile(): Promise<void> {
    if (this.filePath === undefined) {
      return;
    }

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
    const dirPath = path.dirname(this.filePath);
    if (!await FsPoly.exists(dirPath)) {
      await FsPoly.mkdir(dirPath, { recursive: true });
    }

    // Write to a temp file first, then overwrite the old cache file
    const tempFile = await FsPoly.mktemp(this.filePath);
    await util.promisify(fs.writeFile)(
      tempFile,
      JSON.stringify(cacheData),
      { encoding: Cache.BUFFER_ENCODING },
    );
    await FsPoly.mv(tempFile, this.filePath);
  }

  private scheduleSaveToFile(): void {
    if (this.saveToFileTimeout !== undefined) {
      // A save is already scheduled
      return;
    }

    this.saveToFileTimeout = setTimeout(async () => {
      await this.saveToFile();
    }, 10_000);
  }
}
