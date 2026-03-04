/**
 * This file is based heavily on `graceful-fs` v4.2.11. Its license is included, following this block.
 *
 * There are many reasons for replacing `graceful-fs` with a custom module:
 *  - It appears to be abandoned, it hasn't had a release in 3 years
 *  - It's riddled with code that polyfills ancient Node.js versions
 *  - It doesn't include its own types, it requires a `@types` package
 *  - fs.promises.* functions aren't patched, requiring util.promisify()
 *  - fs.*chmod*() functions are retried
 *  - fs.*chown*() functions are retried
 *  - fs.*stat*() functions are retried
 */

/**
 * # Blue Oak Model License
 *
 * Version 1.0.0
 *
 * ## Purpose
 *
 * This license gives everyone as much permission to work with
 * this software as possible, while protecting contributors
 * from liability.
 *
 * ## Acceptance
 *
 * In order to receive this license, you must agree to its
 * rules.  The rules of this license are both obligations
 * under that agreement and conditions to your license.
 * You must not do anything with this software that triggers
 * a rule that you cannot or will not follow.
 *
 * ## Copyright
 *
 * Each contributor licenses you to do everything with this
 * software that would otherwise infringe that contributor's
 * copyright in it.
 *
 * ## Notices
 *
 * You must ensure that everyone who gets a copy of
 * any part of this software from you, with or without
 * changes, also gets the text of this license or a link to
 * <https://blueoakcouncil.org/license/1.0.0>.
 *
 * ## Excuse
 *
 * If anyone notifies you in writing that you have not
 * complied with [Notices](#notices), you can keep your
 * license by taking all practical steps to comply within 30
 * days after the notice.  If you do not do so, your license
 * ends immediately.
 *
 * ## Patent
 *
 * Each contributor licenses you to do everything with this
 * software that would otherwise infringe any patent claims
 * they can license or become able to license.
 *
 * ## Reliability
 *
 * No contributor can revoke this license.
 *
 * ## No Liability
 *
 * ***As far as the law allows, this software comes as is,
 * without any warranty or condition, and no contributor
 * will be liable to anyone for any damages related to this
 * software or this license, under any kind of legal claim.***
 */

import type fs from 'node:fs';

/** Retry for up to 60 seconds before giving up. */
const RETRY_TIMEOUT_MS = 60_000;

/** Exponential backoff multiplier between retries. */
const RETRY_BACKOFF_MULTIPLIER = 1.2;

/** Maximum delay between retries. */
const RETRY_MAX_BACKOFF_MS = 100;

const TRANSIENT_ERRNO_CODES = new Set([
  ...(process.platform === 'win32' ? ['EACCES', 'EPERM'] : []),
  'EBUSY',
  'EAGAIN',
  'EMFILE',
  'ENFILE',
  // Everything below this did not exist in `graceful-fs` v4.2.11!
  'ENOSPC',
  'ETXTBSY',
]);

interface QueueEntry {
  readonly retry: () => void;
  readonly timeout: () => void;
  readonly startTime: number;
  retryCount: number;
}

/**
 * A shared retry queue that serializes re-attempts of file-opening operations under EMFILE/ENFILE
 * pressure. Each entry is retried with exponential backoff and abandoned after `RETRY_TIMEOUT_MS`.
 */
class RetryQueue {
  private readonly entries: QueueEntry[] = [];

  private timer: NodeJS.Timeout | undefined;

  /**
   * Adds a new entry to the queue and schedules processing if not already scheduled.
   */
  enqueue(entry: QueueEntry): void {
    this.entries.push(entry);
    this.scheduleProcess();
  }

  private scheduleProcess(): void {
    if (this.timer !== undefined) return;
    // Compute backoff from the longest-waiting entry to avoid over-scheduling
    const maxRetries = Math.max(...this.entries.map((e) => e.retryCount));
    const delay = Math.min(
      Math.max(maxRetries, 1) * RETRY_BACKOFF_MULTIPLIER,
      RETRY_MAX_BACKOFF_MS,
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.process();
    }, delay);
  }

  private process(): void {
    const entry = this.entries.shift();
    if (entry === undefined) return;

    entry.retryCount++;
    if (Date.now() - entry.startTime >= RETRY_TIMEOUT_MS) {
      // The operation has timed out, fail it
      entry.timeout();
    } else {
      entry.retry();
    }

    if (this.entries.length > 0) {
      this.scheduleProcess();
    }
  }
}

const retryQueue = new RetryQueue();

type FsMethod = (...args: unknown[]) => unknown;
type AsyncFsMethod = (...args: unknown[]) => Promise<unknown>;

type FsResultCallback = (err: NodeJS.ErrnoException | null, ...args: unknown[]) => void;

interface RetryOptions {
  /** Stop after this many attempts (default: retry for up to `RETRY_TIMEOUT_MS`). */
  readonly maxAttempts?: number;
  /** Add exponential backoff between retries (for non-queue sync blocking retries). */
  readonly backoff?: boolean;
  /** Use the shared retry queue instead of an immediate inline retry. */
  readonly useQueue?: boolean;
}

/**
 * Creates a wrapped version of an FS callback function with retry logic for transient errors.
 */
function wrapCallbackMethod<T extends FsMethod>(originalFn: T, options?: RetryOptions): T {
  return function (this: unknown, ...methodArgs: unknown[]) {
    let attempts = 0;
    let backoff = 0;
    const startTime = Date.now();
    const userCallback = methodArgs.pop() as FsResultCallback;

    const attempt = (): void => {
      Reflect.apply(originalFn, this, [
        ...methodArgs,
        (err: NodeJS.ErrnoException | null, ...resultData: unknown[]): void => {
          attempts++;

          if (!err) {
            // The operation succeeded
            userCallback(err, ...resultData);
            return;
          }

          const exceeded =
            Date.now() - startTime >= RETRY_TIMEOUT_MS ||
            (options?.maxAttempts !== undefined && attempts >= options.maxAttempts);
          if (exceeded || !TRANSIENT_ERRNO_CODES.has(err.code ?? '')) {
            userCallback(err, ...resultData);
            return;
          }

          if (options?.useQueue) {
            retryQueue.enqueue({
              retry: attempt,
              timeout: () => {
                userCallback(err);
              },
              startTime,
              retryCount: attempts,
            });
          } else if (options?.backoff) {
            backoff = Math.min(
              Math.max(backoff * RETRY_BACKOFF_MULTIPLIER, 1),
              RETRY_MAX_BACKOFF_MS,
            );
            setTimeout(attempt, backoff);
          } else {
            attempt();
          }
        },
      ]);
    };
    attempt();
  } as T;
}

/**
 * Creates a wrapped version of a synchronous FS function with blocking retry logic.
 */
function wrapSyncMethod<T extends FsMethod>(originalFn: T, options?: RetryOptions): T {
  return function (this: unknown, ...args: unknown[]): unknown {
    let attempts = 0;
    const startTime = Date.now();

    for (;;) {
      try {
        return Reflect.apply(originalFn, this, args);
      } catch (error: unknown) {
        attempts++;

        const exceeded =
          Date.now() - startTime >= RETRY_TIMEOUT_MS ||
          (options?.maxAttempts !== undefined && attempts >= options.maxAttempts);
        if (exceeded || !TRANSIENT_ERRNO_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
          throw error;
        }

        // Backoff isn't respected here on purpose, it doesn't make sense in a synchronous loop
      }
    }
  } as T;
}

/**
 * Creates a wrapped version of a promise-based FS function with async retry logic.
 */
function wrapPromiseMethod<T extends AsyncFsMethod>(originalFn: T, options?: RetryOptions): T {
  return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const startTime = Date.now();

    return await new Promise<unknown>((resolve, reject) => {
      let attempts = 0;
      let backoff = 0;

      const attempt = (): void => {
        originalFn
          .apply(this, args)
          .then(resolve)
          .catch((error: unknown) => {
            attempts++;

            const exceeded =
              Date.now() - startTime >= RETRY_TIMEOUT_MS ||
              (options?.maxAttempts !== undefined && attempts >= options.maxAttempts);

            if (
              exceeded ||
              !TRANSIENT_ERRNO_CODES.has((error as NodeJS.ErrnoException).code ?? '')
            ) {
              reject(error instanceof Error ? error : new Error(String(error)));
              return;
            }

            if (options?.useQueue) {
              retryQueue.enqueue({
                retry: attempt,
                timeout: () => {
                  reject(error instanceof Error ? error : new Error(String(error)));
                },
                startTime,
                retryCount: attempts,
              });
            } else if (options?.backoff) {
              backoff = Math.min(
                Math.max(backoff * RETRY_BACKOFF_MULTIPLIER, 1),
                RETRY_MAX_BACKOFF_MS,
              );
              setTimeout(attempt, backoff);
            } else {
              attempt();
            }
          });
      };
      attempt();
    });
  } as T;
}

/**
 * Patches a given `fs`-like object with graceful retry behavior for transient errors.
 */
export default {
  gracefulify: (fsToPatch: typeof fs): typeof fs => {
    /* eslint-disable @typescript-eslint/no-deprecated */

    ////////// `graceful-fs` graceful-fs.js //////////

    fsToPatch.readFile = wrapCallbackMethod(fsToPatch.readFile as FsMethod, {
      useQueue: true,
    }) as typeof fs.readFile;
    fsToPatch.readFileSync = wrapSyncMethod(fsToPatch.readFileSync as FsMethod, {
      useQueue: true,
    }) as typeof fs.readFileSync;
    fsToPatch.promises.readFile = wrapPromiseMethod(fsToPatch.promises.readFile as AsyncFsMethod, {
      useQueue: true,
    }) as typeof fs.promises.readFile;

    fsToPatch.writeFile = wrapCallbackMethod(fsToPatch.writeFile as FsMethod, {
      useQueue: true,
    }) as typeof fs.writeFile;
    fsToPatch.writeFileSync = wrapSyncMethod(fsToPatch.writeFileSync as FsMethod, {
      useQueue: true,
    }) as typeof fs.writeFileSync;
    fsToPatch.promises.writeFile = wrapPromiseMethod(
      fsToPatch.promises.writeFile as AsyncFsMethod,
      { useQueue: true },
    ) as typeof fs.promises.writeFile;

    fsToPatch.appendFile = wrapCallbackMethod(fsToPatch.appendFile as FsMethod, {
      useQueue: true,
    }) as typeof fs.appendFile;
    fsToPatch.appendFileSync = wrapSyncMethod(fsToPatch.appendFileSync as FsMethod, {
      useQueue: true,
    }) as typeof fs.appendFileSync;
    fsToPatch.promises.appendFile = wrapPromiseMethod(
      fsToPatch.promises.appendFile as AsyncFsMethod,
      { useQueue: true },
    ) as typeof fs.promises.appendFile;

    fsToPatch.copyFile = wrapCallbackMethod(fsToPatch.copyFile as FsMethod, {
      useQueue: true,
    }) as typeof fs.copyFile;
    fsToPatch.copyFileSync = wrapSyncMethod(fsToPatch.copyFileSync as FsMethod, {
      useQueue: true,
    }) as typeof fs.copyFileSync;
    fsToPatch.promises.copyFile = wrapPromiseMethod(fsToPatch.promises.copyFile as AsyncFsMethod, {
      useQueue: true,
    }) as typeof fs.promises.copyFile;

    ////////// `graceful-fs` polyfill.js //////////

    fsToPatch.chown = wrapCallbackMethod(fsToPatch.chown as FsMethod) as typeof fs.chown;
    fsToPatch.chownSync = wrapSyncMethod(fsToPatch.chownSync as FsMethod) as typeof fs.chownSync;
    fsToPatch.promises.chown = wrapPromiseMethod(
      fsToPatch.promises.chown as AsyncFsMethod,
    ) as typeof fs.promises.chown;

    fsToPatch.fchown = wrapCallbackMethod(fsToPatch.fchown as FsMethod) as typeof fs.fchown;
    fsToPatch.fchownSync = wrapSyncMethod(fsToPatch.fchownSync as FsMethod) as typeof fs.fchownSync;

    fsToPatch.lchown = wrapCallbackMethod(fsToPatch.lchown as FsMethod) as typeof fs.lchown;
    fsToPatch.lchownSync = wrapSyncMethod(fsToPatch.lchownSync as FsMethod) as typeof fs.lchownSync;
    fsToPatch.promises.lchown = wrapPromiseMethod(
      fsToPatch.promises.lchown as AsyncFsMethod,
    ) as typeof fs.promises.lchown;

    fsToPatch.chmod = wrapCallbackMethod(fsToPatch.chmod as FsMethod) as typeof fs.chmod;
    fsToPatch.chmodSync = wrapSyncMethod(fsToPatch.chmodSync as FsMethod) as typeof fs.chmodSync;
    fsToPatch.promises.chmod = wrapPromiseMethod(
      fsToPatch.promises.chmod as AsyncFsMethod,
    ) as typeof fs.promises.chmod;

    fsToPatch.fchmod = wrapCallbackMethod(fsToPatch.fchmod as FsMethod) as typeof fs.fchmod;
    fsToPatch.fchmodSync = wrapSyncMethod(fsToPatch.fchmodSync as FsMethod) as typeof fs.fchmodSync;

    fsToPatch.lchmod = wrapCallbackMethod(fsToPatch.lchmod as FsMethod) as typeof fs.lchmod;
    fsToPatch.lchmodSync = wrapSyncMethod(fsToPatch.lchmodSync as FsMethod) as typeof fs.lchmodSync;
    fsToPatch.promises.lchmod = wrapPromiseMethod(
      fsToPatch.promises.lchmod as AsyncFsMethod,
    ) as typeof fs.promises.lchmod;

    fsToPatch.stat = wrapCallbackMethod(fsToPatch.stat as FsMethod) as typeof fs.stat;
    // @ts-expect-error Reassigning a const
    fsToPatch.statSync = wrapSyncMethod(fsToPatch.statSync as FsMethod) as typeof fs.statSync;
    fsToPatch.promises.stat = wrapPromiseMethod(
      fsToPatch.promises.stat as AsyncFsMethod,
    ) as typeof fs.promises.stat;

    fsToPatch.fstat = wrapCallbackMethod(fsToPatch.fstat as FsMethod) as typeof fs.fstat;
    fsToPatch.fstatSync = wrapSyncMethod(fsToPatch.fstatSync as FsMethod) as typeof fs.fstatSync;

    fsToPatch.lstat = wrapCallbackMethod(fsToPatch.lstat as FsMethod) as typeof fs.lstat;
    // @ts-expect-error Reassigning a const
    fsToPatch.lstatSync = wrapSyncMethod(fsToPatch.lstatSync as FsMethod) as typeof fs.lstatSync;
    fsToPatch.promises.lstat = wrapPromiseMethod(
      fsToPatch.promises.lstat as AsyncFsMethod,
    ) as typeof fs.promises.lstat;

    fsToPatch.rename = wrapCallbackMethod(fsToPatch.rename as FsMethod, {
      backoff: true,
    }) as typeof fs.rename;

    fsToPatch.read = wrapCallbackMethod(fsToPatch.read as FsMethod, {
      maxAttempts: 10,
    }) as typeof fs.read;
    fsToPatch.readSync = wrapSyncMethod(fsToPatch.readSync as FsMethod, {
      maxAttempts: 10,
    }) as typeof fs.readSync;

    /*
     * Everything below this did not exist in `graceful-fs` v4.2.11!
     */

    fsToPatch.unlink = wrapCallbackMethod(fsToPatch.unlink as FsMethod) as typeof fs.unlink;
    fsToPatch.unlinkSync = wrapSyncMethod(fsToPatch.unlinkSync as FsMethod) as typeof fs.unlinkSync;
    fsToPatch.promises.unlink = wrapPromiseMethod(
      fsToPatch.promises.unlink as AsyncFsMethod,
    ) as typeof fs.promises.unlink;

    return fsToPatch;
  },
};
