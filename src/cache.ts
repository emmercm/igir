import { E_CANCELED, Mutex } from 'async-mutex';
import crypto from 'crypto';
import { clearTimeout } from 'timers';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class Cache {
  private static readonly MEMORY_CACHE = new Cache();

  // TODO(cemmer): a better filename
  private static readonly DISK_CACHE = new Cache('file.cache');

  private readonly cachedCallGlobalMutex = new Mutex();

  private readonly cachedCallMutexes = new Map<string, Mutex>();

  private readonly cachedCallResults = new Map<string, unknown>();

  private readonly filePath?: string;

  private flushTimer?: NodeJS.Timeout;

  private constructor(filePath?: string) {
    this.filePath = filePath;
  }

  static async inMemory<Args extends any[], Ret>(
    callback: (...args: Args) => Ret | Promise<Ret>,
    ...args: Args
  ): Promise<Ret> {
    return this.MEMORY_CACHE.call(callback, ...args);
  }

  static async toDisk<Args extends any[], Ret>(
    callback: (...args: Args) => Ret | Promise<Ret>,
    ...args: Args
  ): Promise<Ret> {
    return this.DISK_CACHE.call(callback, ...args);
  }

  /**
   * WARN(cemmer): you probably want to `.bind(this)` on the `callback` function before calling
   * this function!
   */
  async call<Args extends any[], Ret>(
    callback: (...args: Args) => Ret | Promise<Ret>,
    ...args: Args
  ): Promise<Ret> {
    // Generate a cache key
    const hash = crypto.createHash('md5');
    hash.update(callback.name);
    args.forEach((arg) => hash.update(arg.toString()));
    const key = hash.digest('hex');

    // Ensure a mutex exists for this key
    if (!this.cachedCallMutexes.has(key)) {
      await this.cachedCallGlobalMutex.runExclusive(() => {
        if (!this.cachedCallMutexes.has(key)) {
          this.cachedCallMutexes.set(key, new Mutex());
        }
      });
    }

    // Return from cache if key exists
    if (this.cachedCallResults.has(key)) {
      return this.cachedCallResults.get(key) as Ret;
    }

    // Calculate and put result in cache
    const mutex = this.cachedCallMutexes.get(key) as Mutex;
    try {
      await mutex.runExclusive(async () => {
        const result = await callback(...args);
        this.cachedCallResults.set(key, result);
        await this.flushToDisk();
        mutex.cancel();
      });
    } catch (e) {
      if (e !== E_CANCELED) {
        throw e;
      }
    }

    return this.cachedCallResults.get(key) as Ret;
  }

  private async flushToDisk(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    this.flushTimer = setTimeout(() => {
      // const data = JSON.stringify({
      //   entries: [...this.cachedCallResults.entries()],
      // });
      // TODO(cemmer): write
    }, 1000);
  }
}
