import { describe, expect, it } from 'vitest';

import KeyedMutex from '../../src/async/keyedMutex.js';

describe('runExclusiveGlobally', () => {
  it('should serialize callbacks and return their values', async () => {
    const mutex = new KeyedMutex();
    let concurrent = 0;
    let maxConcurrent = 0;
    const body = async (): Promise<string> => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      concurrent -= 1;
      return 'ok';
    };

    const results = await Promise.all([
      mutex.runExclusiveGlobally(body),
      mutex.runExclusiveGlobally(body),
    ]);

    expect(maxConcurrent).toEqual(1);
    expect(results).toEqual(['ok', 'ok']);
  });
});

describe('acquire', () => {
  it('should block subsequent acquires on the same key until release is called', async () => {
    const mutex = new KeyedMutex();
    await mutex.acquire('A');

    let secondAcquired = false;
    const second = mutex.acquire('A').then(() => {
      secondAcquired = true;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(secondAcquired).toBe(false);

    mutex.release('A');
    await second;
    expect(secondAcquired).toBe(true);

    mutex.release('A');
  });
});

describe('release', () => {
  it('should unblock a waiting acquire on the same key', async () => {
    const mutex = new KeyedMutex();
    await mutex.acquire('A');

    const waiter = mutex.acquire('A');
    mutex.release('A');
    await expect(waiter).resolves.toBeUndefined();

    mutex.release('A');
  });
});

describe('acquireMultiple', () => {
  it('should block another acquire on any overlapping key until released', async () => {
    const mutex = new KeyedMutex();
    await mutex.acquireMultiple(['A', 'B', 'C']);

    let overlapAcquired = false;
    const overlap = mutex.acquireMultiple(['B']).then(() => {
      overlapAcquired = true;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(overlapAcquired).toBe(false);

    mutex.releaseMultiple(['A', 'B', 'C']);
    await overlap;
    expect(overlapAcquired).toBe(true);

    mutex.releaseMultiple(['B']);
  });

  it('should not deadlock when callers pass keys in opposite order', async () => {
    // Regression: the previous implementation acquired keys in caller-supplied order via
    // Promise.all and relied on a 15 s timeout-and-retry loop, which would stall this test.
    const mutex = new KeyedMutex();
    await Promise.all([
      mutex.runExclusiveForKeys(['X', 'Y'], async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
      }),
      mutex.runExclusiveForKeys(['Y', 'X'], async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
      }),
    ]);
  });
});

describe('releaseMultiple', () => {
  it('should release every given key so they can be acquired again', async () => {
    const mutex = new KeyedMutex();
    await mutex.acquireMultiple(['A', 'B']);
    mutex.releaseMultiple(['A', 'B']);

    await expect(mutex.acquireMultiple(['A', 'B'])).resolves.toBeUndefined();
    mutex.releaseMultiple(['A', 'B']);
  });
});

describe('runExclusiveForKey', () => {
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

  it('should preserve exclusion for one key under heavy eviction churn from other keys', async () => {
    // Regression for the LRU-eviction race: with maxSize=1, every "other" key triggers a
    // potential eviction while a shared key has acquires in flight. The pendingLocks counter
    // in KeyedMutex must keep outstanding references safe so that exclusion never breaks.
    const mutex = new KeyedMutex(1);
    const sharedKey = 'shared';
    let inSection = 0;
    let maxInSection = 0;

    const tasks: Promise<void>[] = [];
    for (let i = 0; i < 50; i += 1) {
      tasks.push(
        mutex.runExclusiveForKey(sharedKey, async () => {
          inSection += 1;
          maxInSection = Math.max(maxInSection, inSection);
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
          inSection -= 1;
        }),
        mutex.runExclusiveForKey(`other-${i}`, async () => {
          await Promise.resolve();
        }),
      );
    }
    await Promise.all(tasks);

    expect(maxInSection).toEqual(1);
  });
});

describe('runExclusiveForKeys', () => {
  it('should serialize callers whose key sets overlap', async () => {
    const mutex = new KeyedMutex();
    let concurrent = 0;
    let maxConcurrent = 0;
    const body = async (): Promise<void> => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      concurrent -= 1;
    };
    // Every pair shares at least one key, so all three must serialize.
    await Promise.all([
      mutex.runExclusiveForKeys(['X', 'Y'], body),
      mutex.runExclusiveForKeys(['Y', 'Z'], body),
      mutex.runExclusiveForKeys(['X', 'Z'], body),
    ]);

    expect(maxConcurrent).toEqual(1);
  });

  it('should not deadlock with many callers holding random permutations of a shared key set', async () => {
    const mutex = new KeyedMutex();
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    const shuffled = (): string[] => {
      const out = [...keys];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };

    await Promise.all(
      Array.from({ length: 50 }, async () => {
        await mutex.runExclusiveForKeys(shuffled(), async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
        });
      }),
    );
  });
});
