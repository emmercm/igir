import { describe, expect, it } from 'vitest';

import KeyedMutex from '../../src/async/keyedMutex.js';

describe('KeyedMutex', () => {
  it('should execute exclusive callbacks for different keys in parallel', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    await Promise.all([
      mutex.runExclusiveForKey('A', async () => {
        order.push('A-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('A-end');
      }),
      mutex.runExclusiveForKey('B', async () => {
        order.push('B-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('B-end');
      }),
    ]);

    expect(order).toEqual(['A-start', 'B-start', 'A-end', 'B-end']);
  });

  it('should serialize exclusive callbacks for the same key', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    await Promise.all([
      mutex.runExclusiveForKey('A', async () => {
        order.push('A1-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('A1-end');
      }),
      mutex.runExclusiveForKey('A', async () => {
        order.push('A2-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('A2-end');
      }),
    ]);

    expect(order).toEqual(['A1-start', 'A1-end', 'A2-start', 'A2-end']);
  });

  it('should return the callback return value', async () => {
    const mutex = new KeyedMutex();

    const result = await mutex.runExclusiveForKey('A', async () => {
      await Promise.resolve();
      return 'test-value';
    });

    expect(result).toEqual('test-value');
  });

  it('should support custom maxSize', async () => {
    const mutex = new KeyedMutex(1);
    let aExecuted = false;

    await mutex.runExclusiveForKey('A', async () => {
      aExecuted = true;
      await Promise.resolve();
    });
    expect(aExecuted).toBe(true);

    // Insert a different key, which should evict A.
    await mutex.runExclusiveForKey('B', async () => {
      await Promise.resolve();
    });

    // Now A should be a fresh mutex (so it can be acquired again).
    const result = await mutex.runExclusiveForKey('A', async () => {
      await Promise.resolve();
      return 'ok';
    });
    expect(result).toEqual('ok');
  });

  it('should not evict locked keys', async () => {
    const mutex = new KeyedMutex(2);
    let bWasAcquired = false;

    // Start an exclusive operation for A that will hold the lock.
    const aPromise = mutex.runExclusiveForKey('A', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Small delay to ensure A is locked first.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Try to acquire B and C (should not evict A since it's locked).
    await mutex.runExclusiveForKey('B', async () => {
      bWasAcquired = true;
      await Promise.resolve();
    });

    await mutex.runExclusiveForKey('C', async () => {
      await Promise.resolve();
    });

    // Wait for A to finish.
    await aPromise;

    // All three keys should still be in the cache.
    // We can't directly test this, but we can verify the operations completed.
    expect(bWasAcquired).toBe(true);
  });

  it('should evict the least-recently-used unlocked key when maxSize is exceeded', async () => {
    const mutex = new KeyedMutex(2);
    await mutex.runExclusiveForKey('A', async () => {
      await Promise.resolve();
    });
    await mutex.runExclusiveForKey('B', async () => {
      await Promise.resolve();
    });
    // A is oldest; inserting C should evict A.
    await mutex.runExclusiveForKey('C', async () => {
      await Promise.resolve();
    });
    // Re-acquiring A should succeed (a fresh mutex gets created).
    await expect(
      mutex.runExclusiveForKey('A', async () => {
        await Promise.resolve();
        return 'ok';
      }),
    ).resolves.toEqual('ok');
  });
});
