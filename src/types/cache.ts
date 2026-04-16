import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import zlib from 'node:zlib';

import { E_CANCELED, Mutex } from 'async-mutex';

import KeyedMutex from '../async/keyedMutex.js';
import Timer from '../async/timer.js';
import FsPoly from '../polyfill/fsPoly.js';

export interface CacheProps {
  filePath?: string;
  fileFlushMillis?: number;
  saveOnExit?: boolean;
}

/**
 * A cache of a fixed size that ejects the oldest inserted key.
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
    return await this.keyedMutex.runExclusiveForKey(key, () => this.keyValues.get(key));
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
  async load(): Promise<Cache<V>> {
    if (this.filePath === undefined || !(await FsPoly.exists(this.filePath))) {
      // Cache doesn't exist, so there is nothing to load
      return this;
    }

    try {
      const chunks: Buffer[] = [];
      await stream.promises.pipeline(
        fs.createReadStream(this.filePath),
        zlib.createGunzip(),
        new stream.Writable({
          write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
            chunks.push(chunk);
            cb();
          },
        }),
      );
      if (chunks.length === 0) {
        return this;
      }
      const keyValuesObject = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
        string,
        V
      >;
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

        const keyValuesObject = Object.fromEntries(this.keyValues);
        const json = JSON.stringify(keyValuesObject);
        // Reset before I/O so mid-save changes re-set the flag
        this.hasChanged = false;

        // Ensure the directory exists
        const dirPath = path.dirname(this.filePath);
        if (!(await FsPoly.exists(dirPath))) {
          await FsPoly.mkdir(dirPath, { recursive: true });
        }

        // Write to a temp file first
        const tempFile = await FsPoly.mktemp(this.filePath);
        try {
          await stream.promises.pipeline(
            stream.Readable.from([Buffer.from(json, 'utf8')]),
            zlib.createGzip(),
            fs.createWriteStream(tempFile),
          );

          // Validate the file was written correctly
          const tempFileCache = await new Cache({ filePath: tempFile }).load();
          if (tempFileCache.size() !== Object.keys(keyValuesObject).length) {
            // The written file is bad, don't use it
            await FsPoly.rm(tempFile, { force: true });
            this.hasChanged = true;
            return;
          }

          // Overwrite the real file with the temp file
          await FsPoly.mv(tempFile, this.filePath);
        } catch {
          await FsPoly.rm(tempFile, { force: true });
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
