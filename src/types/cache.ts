import fs from 'node:fs';
import path from 'node:path';
import * as v8 from 'node:v8';
import * as zlib from 'node:zlib';

import { E_CANCELED, Mutex } from 'async-mutex';

import KeyedMutex from '../keyedMutex.js';
import FsPoly from '../polyfill/fsPoly.js';
import Timer from '../timer.js';

export interface CacheProps {
  filePath?: string;
  fileFlushMillis?: number;
  saveOnExit?: boolean;
}

/**
 * A cache of a fixed size that ejects the oldest inserted key.
 */
export default class Cache<V> {
  private static readonly BUFFER_ENCODING: BufferEncoding = 'binary';

  private keyValues = new Map<string, V>();

  private readonly keyedMutex = new KeyedMutex(1000);

  private hasChanged = false;

  private saveToFileTimeout?: Timer;

  readonly filePath?: string;

  readonly fileFlushMillis?: number;

  private readonly saveMutex = new Mutex();

  constructor(props?: CacheProps) {
    this.filePath = props?.filePath;
    this.fileFlushMillis = props?.fileFlushMillis;
    if (props?.saveOnExit) {
      // WARN: Jest won't call this: https://github.com/jestjs/jest/issues/10927
      process.once('beforeExit', async () => {
        await this.save();
      });
    }
  }

  /**
   * Return if a key exists in the cache, waiting for any existing operations to complete first.
   */
  public async has(key: string): Promise<boolean> {
    return this.keyedMutex.runExclusiveForKey(key, () => this.keyValues.has(key));
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
    return this.keyedMutex.runExclusiveForKey(key, () => this.keyValues.get(key));
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
    return this.keyedMutex.runExclusiveForKey(key, async () => {
      if (this.keyValues.has(key)) {
        const existingValue = this.keyValues.get(key) as V;
        if (shouldRecompute === undefined || !(await shouldRecompute(existingValue))) {
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
    return this.keyedMutex.runExclusiveForKey(key, () => {
      this.setUnsafe(key, val);
    });
  }

  private setUnsafe(key: string, val: V): void {
    const oldVal = this.keyValues.get(key);
    this.keyValues.set(key, val);
    if (val !== oldVal) {
      this.saveWithTimeout();
    }
  }

  /**
   * Delete a key in the cache.
   */
  public async delete(key: string | RegExp): Promise<void> {
    let keysToDelete: string[];
    if (key instanceof RegExp) {
      keysToDelete = [...this.keys().keys()].filter((k) => k.match(key) !== null);
    } else {
      keysToDelete = [key];
    }

    // Note: avoiding lockKey() because it could get expensive with many keys to delete
    await this.keyedMutex.runExclusiveGlobally(() => {
      keysToDelete.forEach((k) => {
        this.deleteUnsafe(k);
      });
    });
  }

  private deleteUnsafe(key: string): void {
    this.keyValues.delete(key);
    this.saveWithTimeout();
  }

  /**
   * Load the cache from a file.
   */
  public async load(): Promise<Cache<V>> {
    if (this.filePath === undefined || !(await FsPoly.exists(this.filePath))) {
      // Cache doesn't exist, so there is nothing to load
      return this;
    }

    try {
      const compressed = await fs.promises.readFile(this.filePath);
      if (compressed.length === 0) {
        return this;
      }
      // NOTE(cemmer): util.promisify(zlib.inflate) seems to have issues not throwing correctly
      const decompressed = zlib.inflateSync(compressed);
      const keyValuesObject = v8.deserialize(decompressed) as Record<string, V>;
      const keyValuesEntries = Object.entries(keyValuesObject);
      this.keyValues = new Map(keyValuesEntries);
    } catch {
      /* ignored */
    }

    return this;
  }

  private saveWithTimeout(): void {
    this.hasChanged = true;
    if (
      this.filePath === undefined ||
      this.fileFlushMillis === undefined ||
      this.saveToFileTimeout !== undefined
    ) {
      return;
    }

    this.saveToFileTimeout = Timer.setTimeout(async () => this.save(), this.fileFlushMillis);
  }

  /**
   * Save the cache to a file.
   */
  public async save(): Promise<void> {
    try {
      await this.saveMutex.runExclusive(async () => {
        // Clear any existing timeout
        if (this.saveToFileTimeout !== undefined) {
          this.saveToFileTimeout.cancel();
          this.saveToFileTimeout = undefined;
        }

        if (this.filePath === undefined || !this.hasChanged) {
          return;
        }

        const keyValuesObject = Object.fromEntries(this.keyValues);
        const decompressed = v8.serialize(keyValuesObject);
        // NOTE(cemmer): util.promisify(zlib.deflate) seems to have issues not throwing correctly
        const compressed = zlib.deflateSync(decompressed);

        // Ensure the directory exists
        const dirPath = path.dirname(this.filePath);
        if (!(await FsPoly.exists(dirPath))) {
          await FsPoly.mkdir(dirPath, { recursive: true });
        }

        // Write to a temp file first
        const tempFile = await FsPoly.mktemp(this.filePath);
        await FsPoly.writeFile(tempFile, compressed, { encoding: Cache.BUFFER_ENCODING });

        // Validate the file was written correctly
        const tempFileCache = await new Cache({ filePath: tempFile }).load();
        if (tempFileCache.size() !== Object.keys(keyValuesObject).length) {
          // The written file is bad, don't use it
          await FsPoly.rm(tempFile, { force: true });
          return;
        }

        // Overwrite the real file with the temp file
        try {
          await FsPoly.mv(tempFile, this.filePath);
        } catch {
          return;
        }
        this.hasChanged = false;
        this.saveMutex.cancel(); // cancel all waiting locks, we just saved
      });
    } catch (error) {
      if (error !== E_CANCELED) {
        throw error;
      }
    }
  }
}
