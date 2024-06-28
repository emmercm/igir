import path from 'node:path';

import Defaults from '../../src/constants/defaults.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import Cache from '../../src/types/cache.js';

const TEST_CACHE_SIZE = 100;

describe('has', () => {
  it('should return false with empty cache', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await expect(cache.has(String(i))).resolves.toEqual(false);
    }
  });

  it('should return true after setting', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.has(String(i))).resolves.toEqual(true);
    }
  });
});

describe('keys', () => {
  it('should return nothing with empty cache', () => {
    const cache = new Cache<number>();
    expect(cache.keys().size).toEqual(0);
  });

  it('should return the correct keys', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
    }
    expect(cache.keys()).toEqual(new Set(
      Array.from({ length: TEST_CACHE_SIZE }).map((_, idx) => String(idx)),
    ));
  });
});

describe('size', () => {
  it('should return zero with empty cache', () => {
    const cache = new Cache<number>();
    expect(cache.size()).toEqual(0);
  });

  it('should return the correct size after setting', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      expect(cache.size()).toEqual(i + 1);
    }
  });
});

describe('get', () => {
  it('should return undefined with empty cache', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await expect(cache.get(String(i))).resolves.toBeUndefined();
    }
  });

  it('should return the value after setting', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.get(String(i))).resolves.toEqual(i);
    }
  });
});

describe('getOrCompute', () => {
  it('should compute a value if the key is missing', async () => {
    const cache = new Cache<number>();

    let computed = 0;
    const runnable = (key: string): number => {
      computed += 1;
      return Number.parseInt(key, 10);
    };

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await expect(cache.getOrCompute(String(i), runnable)).resolves.toEqual(i);
    }
    expect(computed).toEqual(TEST_CACHE_SIZE);
  });

  it('should not compute a value if the key exists', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
    }

    let computed = 0;
    const runnable = (key: string): number => {
      computed += 1;
      return Number.parseInt(key, 10);
    };

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await expect(cache.getOrCompute(String(i), runnable)).resolves.toEqual(i);
    }
    expect(computed).toEqual(0);
  });

  it('should respect max cache size', async () => {
    const maxSize = Math.floor(TEST_CACHE_SIZE / 2);
    const cache = new Cache<number>({ maxSize });

    for (let i = 0; i < maxSize; i += 1) {
      await cache.getOrCompute(String(i), () => i);
      expect(cache.size()).toEqual(i + 1);
    }

    for (let i = maxSize; i < TEST_CACHE_SIZE; i += 1) {
      await cache.getOrCompute(String(i), () => i);
      expect(cache.size()).toEqual(maxSize);
    }
  });
});

describe('set', () => {
  it('should set a value for a key that doesn\'t exist', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      await expect(cache.get(String(i))).resolves.toEqual(i);
    }
  });

  it('should set a value for a key that exists', async () => {
    const cache = new Cache<number>();

    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      await cache.set(String(i), i * 2);
      await expect(cache.get(String(i))).resolves.toEqual(i * 2);
    }
  });

  it('should respect max cache size', async () => {
    const maxSize = Math.floor(TEST_CACHE_SIZE / 2);
    const cache = new Cache<number>({ maxSize });

    for (let i = 0; i < maxSize; i += 1) {
      await cache.set(String(i), i);
      expect(cache.size()).toEqual(i + 1);
    }

    for (let i = maxSize; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
      expect(cache.size()).toEqual(maxSize);
    }
  });
});

describe('delete', () => {
  it('should delete a single key', async () => {
    const cache = new Cache<string>();

    await cache.set('key', 'value');
    await expect(cache.has('key')).resolves.toEqual(true);

    await cache.delete('key');
    await expect(cache.has('key')).resolves.toEqual(false);
  });

  it('should delete regex-matched keys', async () => {
    const cache = new Cache<string>();

    await cache.set('key1', 'value');
    await expect(cache.has('key1')).resolves.toEqual(true);
    await cache.set('key2', 'value');
    await expect(cache.has('key2')).resolves.toEqual(true);
    await cache.set('key3', 'value');
    await expect(cache.has('key3')).resolves.toEqual(true);

    await cache.delete(/key[12]/);
    await expect(cache.has('key1')).resolves.toEqual(false);
    await expect(cache.has('key2')).resolves.toEqual(false);
    await expect(cache.has('key3')).resolves.toEqual(true);
  });
});

describe('load', () => {
  it('should not throw on nonexistent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);

    const cache = new Cache<number>({ filePath: tempFile });
    await expect(cache.load()).resolves.toBeTruthy();
  });

  it('should not throw on empty file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));
    await FsPoly.touch(tempFile);
    try {
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);

      const cache = new Cache<number>({ filePath: tempFile });
      await expect(cache.load()).resolves.toBeTruthy();
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should load after saving a populated cache', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));

    const firstCache = new Cache<number>({ filePath: tempFile });
    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await firstCache.set(String(i), i);
    }
    await firstCache.save();

    try {
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);

      const secondCache = new Cache<number>({ filePath: tempFile });
      await secondCache.load();
      expect(secondCache.size()).toEqual(TEST_CACHE_SIZE);
      expect(secondCache.keys()).toEqual(new Set(
        Array.from({ length: TEST_CACHE_SIZE }).map((_, idx) => String(idx)),
      ));
      for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
        await expect(secondCache.get(String(i))).resolves.toEqual(i);
      }
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });
});

describe('save', () => {
  it('should not save an empty cache', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));

    const cache = new Cache<number>({ filePath: tempFile });
    await cache.save();

    try {
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should save a populated cache', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Defaults.GLOBAL_TEMP_DIR, 'cache'));

    const cache = new Cache<number>({ filePath: tempFile });
    for (let i = 0; i < TEST_CACHE_SIZE; i += 1) {
      await cache.set(String(i), i);
    }
    await cache.save();

    try {
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });
});
