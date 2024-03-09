import os from 'node:os';

import Constants from '../../src/constants.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import Cache from '../../src/types/cache.js';

describe('eviction', () => {
  it('should not evict keys by default', async () => {
    const cache = new Cache<number>();
    await expect(cache.size()).resolves.toEqual(0);

    for (let i = 0; i < 100; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.size()).resolves.toEqual(i + 1);
    }
  });

  it('should evict keys', async () => {
    const maxSize = 10;
    const cache = new Cache<number>({ maxSize });
    await expect(cache.size()).resolves.toEqual(0);

    for (let i = 0; i < 10; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.size()).resolves.toEqual(i + 1);
    }

    for (let i = 0; i < 100; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.size()).resolves.toEqual(10);
    }
  });
});

describe('serialization', () => {
  it('should load from a nonexistent file', async () => {
    const cache = new Cache<number>({ filePath: os.devNull });
    await expect(cache.size()).resolves.toEqual(0);

    for (let i = 0; i < 10; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.size()).resolves.toEqual(i + 1);
    }
  });

  it('should be able to read after write', async () => {
    const tempFile = await FsPoly.mktemp(Constants.GLOBAL_TEMP_DIR);
    try {
      // Add some keys to the cache
      const firstCache = new Cache<number>({ filePath: tempFile });
      for (let i = 0; i < 10; i += 1) {
        await firstCache.set(String(i), i);
        await expect(firstCache.size()).resolves.toEqual(i + 1);
      }

      // Wait until the cache has been flushed to disk
      while (!await FsPoly.exists(tempFile)) {
        await new Promise((resolve) => { setTimeout(resolve, 1000); });
      }

      // Read the cache
      const secondCache = new Cache<number>({ filePath: tempFile });
      await expect(secondCache.keys()).resolves.toEqual(await firstCache.keys());
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });
});
