import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import string_decoder from 'node:string_decoder';
import zlib from 'node:zlib';

import { E_CANCELED, Mutex } from 'async-mutex';

import KeyedMutex from '../async/keyedMutex.js';
import Timer from '../async/timer.js';
import FsUtil from '../utils/fsUtil.js';

export interface CacheProps {
  filePath?: string;
  fileFlushMillis?: number;
  saveOnExit?: boolean;
}

/**
 * A cache of an unbounded size.
 */
export default class Cache<V> {
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
   * Return the file path that this cache was loaded from, and will also save to.
   */
  getFilePath(): string | undefined {
    return this.filePath;
  }

  /**
   * Return if a key exists in the cache, waiting for any existing operations to complete first.
   */
  async has(key: string): Promise<boolean> {
    return await this.keyedMutex.runExclusiveForKey(key, () => this.keyValues.has(key));
  }

  /**
   * Return all the keys that exist in the cache.
   */
  keys(): Set<string> {
    return new Set(this.keyValues.keys());
  }

  /**
   * Return the count of keys in the cache.
   */
  size(): number {
    return this.keyValues.size;
  }

  /**
   * Get the value of a key in the cache, waiting for any existing operations to complete first.
   */
  async get(key: string): Promise<V | undefined> {
    const cached = this.getUnsafe(key);
    if (cached !== undefined) {
      return cached;
    }

    return await this.keyedMutex.runExclusiveForKey(key, () => this.getUnsafe(key));
  }

  private getUnsafe(key: string): V | undefined {
    return this.keyValues.get(key);
  }

  /**
   * Get the value of a key in the cache if it exists, or compute a value and set it in the cache
   * otherwise.
   */
  async getOrCompute(
    key: string,
    runnable: (key: string) => V | Promise<V>,
    shouldRecompute?: (value: V) => boolean | Promise<boolean>,
  ): Promise<V> {
    const cached = this.getUnsafe(key);
    if (
      cached !== undefined &&
      (shouldRecompute === undefined || !(await shouldRecompute(cached)))
    ) {
      return cached;
    }

    return await this.keyedMutex.runExclusiveForKey(key, async () => {
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
   * Get the values of all keys in the cache if they exist, or compute all values and set them
   * in the cache if any key is missing.
   */
  async getOrComputeAllKeys(
    keys: string[],
    runnable: () => Map<string, V> | Promise<Map<string, V>>,
  ): Promise<Map<string, V>> {
    if (keys.length === 0) {
      return new Map();
    }

    // Fast path: check all keys without obtaining any locks
    const values = keys.map((key) => this.getUnsafe(key));
    if (values.every((value) => value !== undefined)) {
      return keys.reduce((map, key, idx) => {
        map.set(key, values[idx]);
        return map;
      }, new Map<string, V>());
    }

    // Slow path: acquire all key locks, double-check, then compute if still needed.
    await this.keyedMutex.acquireMultiple(keys);
    try {
      // Re-check under lock using direct map access (not get(), which would deadlock)
      const values = keys.map((key) => this.keyValues.get(key));
      if (values.every((value) => value !== undefined)) {
        return keys.reduce((map, key, idx) => {
          map.set(key, values[idx]);
          return map;
        }, new Map<string, V>());
      }

      // Compute and store all values
      const computed = await runnable();
      for (const [key, value] of computed) {
        this.setUnsafe(key, value);
      }
      return computed;
    } finally {
      this.keyedMutex.releaseMultiple(keys);
    }
  }

  /**
   * Get the value of any key in the cache if one exists, or compute a value and set it under all
   * keys otherwise. Assumes all keys map to the same value.
   */
  async getOrComputeAnyKeys(
    keys: string[],
    runnable: () => V | Promise<V>,
    shouldRecompute?: (value: V) => boolean | Promise<boolean>,
  ): Promise<V | undefined> {
    if (keys.length === 0) {
      return undefined;
    }

    // Fast path: check all keys without obtaining any locks
    const values = keys.map((key) => this.getUnsafe(key));
    const firstDefinedValue = values.find((value) => value !== undefined);
    if (
      firstDefinedValue !== undefined &&
      (shouldRecompute === undefined || !(await shouldRecompute(firstDefinedValue)))
    ) {
      return firstDefinedValue;
    }

    // Slow path: acquire all key locks, double-check, then compute if still needed.
    await this.keyedMutex.acquireMultiple(keys);
    try {
      // Re-check under lock using direct map access (not get(), which would deadlock)
      const firstDefinedValue = keys
        .map((key) => this.keyValues.get(key))
        .find((value) => value !== undefined);
      if (
        firstDefinedValue !== undefined &&
        (shouldRecompute === undefined || !(await shouldRecompute(firstDefinedValue)))
      ) {
        return firstDefinedValue;
      }

      // Compute and store under all keys
      const computed = await runnable();
      for (const key of keys) {
        this.setUnsafe(key, computed);
      }
      return computed;
    } finally {
      this.keyedMutex.releaseMultiple(keys);
    }
  }

  /**
   * Set the value of a key in the cache.
   */
  async set(key: string, val: V): Promise<void> {
    await this.keyedMutex.runExclusiveForKey(key, () => {
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
  async delete(key: string | RegExp): Promise<void> {
    let keysToDelete: string[];
    if (key instanceof RegExp) {
      keysToDelete = [...this.keys()].filter((k) => k.match(key) !== null);
    } else {
      keysToDelete = [key];
    }

    // Note: avoiding lockKey() because it could get expensive with many keys to delete
    await this.keyedMutex.runExclusiveGlobally(() => {
      for (const k of keysToDelete) {
        this.deleteUnsafe(k);
      }
    });
  }

  private deleteUnsafe(key: string): void {
    this.keyValues.delete(key);
    this.saveWithTimeout();
  }

  /**
   * Load the cache from a file.
   */
  async load(): Promise<Cache<V>> {
    if (this.filePath === undefined || !(await FsUtil.exists(this.filePath))) {
      // Cache doesn't exist, so there is nothing to load
      return this;
    }

    try {
      // Parse the cache file incrementally, one newline-delimited [key, value] record at a time.
      // Never rebuild the whole file into a single string: on large collections the serialized
      // cache can exceed V8's maximum string length and throw a `RangeError`.
      const decoder = new string_decoder.StringDecoder('utf8');
      const map = new Map<string, V>();
      let buffer = '';
      const readState = { hasData: false };
      const ingestLine = (line: string): void => {
        if (line.length === 0) {
          return;
        }
        const entry = JSON.parse(line) as unknown;
        if (Array.isArray(entry) && entry.length === 2) {
          const [key, value] = entry as [string, V];
          map.set(key, value);
        }
      };
      await stream.promises.pipeline(
        fs.createReadStream(this.filePath),
        zlib.createGunzip(),
        new stream.Writable({
          write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
            readState.hasData = true;
            buffer += decoder.write(chunk);
            let idx = buffer.indexOf('\n');
            while (idx !== -1) {
              ingestLine(buffer.slice(0, idx));
              buffer = buffer.slice(idx + 1);
              idx = buffer.indexOf('\n');
            }
            cb();
          },
        }),
      );
      buffer += decoder.end();
      ingestLine(buffer);
      if (!readState.hasData) {
        return this;
      }
      this.keyValues = map;
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

    this.saveToFileTimeout = Timer.setTimeout(async () => {
      try {
        await this.save();
      } finally {
        this.saveToFileTimeout = undefined;
      }
    }, this.fileFlushMillis);
  }

  /**
   * Save the cache to a file.
   */
  async save(): Promise<void> {
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

        const entries = [...this.keyValues];
        // Reset before I/O so mid-save changes re-set the flag
        this.hasChanged = false;

        // Ensure the directory exists
        const dirPath = path.dirname(this.filePath);
        if (!(await FsUtil.exists(dirPath))) {
          await FsUtil.mkdir(dirPath, { recursive: true });
        }

        // Write to a temp file first
        const tempFile = await FsUtil.mktemp(this.filePath);
        try {
          // Stream one newline-delimited [key, value] record at a time. This avoids serializing
          // the entire cache into a single string, which can exceed V8's maximum string length
          // and throw a `RangeError` on large collections.
          await stream.promises.pipeline(
            stream.Readable.from(
              (function* (): Generator<Buffer> {
                for (const entry of entries) {
                  yield Buffer.from(`${JSON.stringify(entry)}\n`, 'utf8');
                }
              })(),
            ),
            zlib.createGzip(),
            fs.createWriteStream(tempFile),
          );

          // Validate the file was written correctly
          const tempFileCache = await new Cache({ filePath: tempFile }).load();
          if (tempFileCache.size() !== entries.length) {
            // The written file is bad, don't use it
            await FsUtil.rm(tempFile, { force: true });
            this.hasChanged = true;
            return;
          }

          // Overwrite the real file with the temp file
          await FsUtil.mv(tempFile, this.filePath);
        } catch {
          await FsUtil.rm(tempFile, { force: true });
          this.hasChanged = true;
          return;
        }
        this.saveMutex.cancel(); // cancel all waiting locks, we just saved
      });
    } catch (error) {
      if (error !== E_CANCELED) {
        throw error;
      }
    }
  }
}
