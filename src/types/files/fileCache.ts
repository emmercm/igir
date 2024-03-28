import { Stats } from 'node:fs';

import Constants from '../../constants.js';
import FsPoly from '../../polyfill/fsPoly.js';
import Cache from '../cache.js';
import File from './file.js';
import { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
  value: ChecksumProps | ChecksumProps[],
}

type CachedMethod<T> = (
  checksumBitmask: number,
  ...args: unknown[]
) => Promise<T>;

type CacheDecorator<T> = (
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<CachedMethod<T>>,
) => TypedPropertyDescriptor<CachedMethod<T>>;

export interface CacheProps {
  // An exact checksum bitmask that should skip caching, because it's easy or fast to compute.
  // For example, zip archives have CRC32 in their central directory.
  skipChecksumBitmask?: number,

  serializer?: () => void,
  deserializer?: () => void,
}

enum ValueType {
  FILE = 'F',
  ARCHIVE_ENTRIES = 'A',
}

export default class FileCache {
  private static readonly VERSION = 2;

  private static readonly CACHE = new Cache<CacheValue>({
    filePath: process.env.NODE_ENV !== 'test' ? Constants.GLOBAL_CACHE_FILE : undefined,
    fileFlushMillis: 30_000,
  })
    .load()
    .then(async (cache) => {
      await Promise.all([...Array.from({ length: FileCache.VERSION }).keys()].slice(1)
        .map(async (prevVersion) => {
          const keyRegex = new RegExp(`^V${prevVersion}\\|`);
          return cache.delete(keyRegex);
        }));
      return cache;
    });

  private static enabled = true;

  public static disable(): void {
    this.enabled = false;
  }

  static CacheArchiveEntries <T>(
    cacheProps?: CacheProps,
  ): CacheDecorator<T> {
    return (
      target: object,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<CachedMethod<T>>,
    ): TypedPropertyDescriptor<CachedMethod<T>> => {
      const originalMethod = descriptor.value;
      if (!originalMethod) {
        throw new Error('@CacheArchiveEntries couldn\'t get a method from the descriptor');
      }

      // eslint-disable-next-line no-param-reassign,func-names
      descriptor.value = async function (checksumBitmask, args): Promise<T> {
        // NOTE(cemmer): `function` is required for `this` to bind correctly
        if (!(this instanceof File)) {
          throw new Error('@CacheArchiveEntries can only be used within File classes');
        }
        const newMethod = async (): Promise<T> => originalMethod.call(
          this,
          checksumBitmask,
          args,
        );

        if (!FileCache.enabled || checksumBitmask === cacheProps?.skipChecksumBitmask) {
          return newMethod();
        }

        return FileCache.getOrComputeFile(this, checksumBitmask, newMethod);
      };
      return descriptor;
    };
  }

  private static getCacheKey(stats: Stats, valueType: ValueType): string {
    return `V${FileCache.VERSION}|${stats.ino}|${valueType}`;
  }

  private static async getOrComputeFile(
    filePath: string,
    checksumBitmask: number,
    runnable: () => Promise<File | File[]>,
  ): Promise<File> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = this.getCacheKey(stats, ValueType.FILE);

    let result: File | File[] | undefined;
    const cached = await (await this.CACHE).getOrCompute(
      cacheKey,
      async () => {
        result = await runnable();
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: Array.isArray(result)
            ? result.map((file) => file.toObject())
            : result.toObject(),
        } satisfies CacheValue;
      },
      async () => {
        // TODO(cemmer): move the cache validation code from below to here
        return false;
      },
    );

    if (result) {
      // Was computed, use the computed value
      return result;
    }
    // Otherwise, deserialize the cached value
    return File.fileOfObject(filePath, {
      ...cached.file,
      filePath,
      // Only return the checksums requested
      crc32: checksumBitmask & ChecksumBitmask.CRC32 ? cached.file.crc32 : undefined,
      md5: checksumBitmask & ChecksumBitmask.MD5 ? cached.file.md5 : undefined,
      sha1: checksumBitmask & ChecksumBitmask.SHA1 ? cached.file.sha1 : undefined,
      sha256: checksumBitmask & ChecksumBitmask.SHA256 ? cached.file.sha256 : undefined,
    });
  }

  private static async getCachedValue(
    filePath: string,
    valueType: ValueType,
    checksumBitmask: number,
  ): Promise<CacheValue | undefined> {
    let stats: Stats;
    try {
      stats = await FsPoly.stat(filePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist
        return undefined;
      }
      throw error;
    }
    const cacheKey = this.getCacheKey(stats, valueType);

    const existing = await (await this.CACHE).get(cacheKey);
    if (!existing) {
      // File isn't cached
      return undefined;
    }

    if (existing.fileSize !== stats.size
      || existing.modifiedTimeMillis !== stats.mtimeMs
    ) {
      // File has changed since being cached
      return undefined;
    }

    const checksumProps = Array.isArray(existing.value) ? existing.value : [existing.value];
    const existingBitmask = (checksumProps.every((props) => props.crc32 !== undefined && props.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
      | (checksumProps.every((props) => props.md5) ? ChecksumBitmask.MD5 : 0)
      | (checksumProps.every((props) => props.sha1) ? ChecksumBitmask.SHA1 : 0)
      | (checksumProps.every((props) => props.sha256) ? ChecksumBitmask.SHA256 : 0);
    const remainingBitmask = checksumBitmask ^ existingBitmask;
    if (remainingBitmask) {
      // We need checksums that haven't been cached yet
      return undefined;
    }

    return existing;
  }
}
