import { Stats } from 'node:fs';

import Constants from '../../constants.js';
import FsPoly from '../../polyfill/fsPoly.js';
import Cache from '../cache.js';
import Archive from './archives/archive.js';
import ArchiveEntry, { ArchiveEntryProps } from './archives/archiveEntry.js';
import File from './file.js';
import { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
}

type ArchiveRawMethod = (
  checksumBitmask: number,
  ...args: unknown[]
) => Promise<File>;

type ArchiveRawDecorator = (
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<ArchiveRawMethod>,
) => TypedPropertyDescriptor<ArchiveRawMethod>;

interface FileCacheValue extends CacheValue {
  // TODO(cemmer): this isn't right, FileProps/ArchiveEntryProps is correct
  file: ChecksumProps,
}

type ArchiveEntriesMethod<T extends ArchiveEntry<Archive>> = (
  checksumBitmask: number,
  ...args: unknown[]
) => Promise<T[]>;

type ArchiveEntriesDecorator<T extends ArchiveEntry<Archive>> = (
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<ArchiveEntriesMethod<T>>,
) => TypedPropertyDescriptor<ArchiveEntriesMethod<T>>;

export interface CacheArchiveEntriesProps {
  // An exact checksum bitmask that should skip caching, because it's easy or fast to compute.
  // For example, zip archives have CRC32 in their central directory.
  skipChecksumBitmask?: number,
}

enum ValueType {
  FILE = 'F',
  ARCHIVE_ENTRIES = 'A',
}

interface ArchiveEntriesCacheValue extends CacheValue {
  // TODO(cemmer): this isn't right, FileProps/ArchiveEntryProps is correct
  entries: ChecksumProps[],
}

export default class FileCache {
  private static readonly VERSION = 2;

  private static readonly CACHE = new Cache<FileCacheValue | ArchiveEntriesCacheValue>({
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

  static CacheArchiveRaw(): ArchiveRawDecorator {
    return (
      target: object,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<ArchiveRawMethod>,
    ): TypedPropertyDescriptor<ArchiveRawMethod> => {
      const originalMethod = descriptor.value;
      if (!originalMethod) {
        throw new Error('@CacheArchiveRaw couldn\'t get a method from the descriptor');
      }

      // eslint-disable-next-line no-param-reassign
      descriptor.value = async function (checksumBitmask, args): Promise<File> {
        // NOTE(cemmer): `function` is required for `this` to bind correctly
        if (!(this instanceof ArchiveEntry)) {
          throw new Error('@CacheArchiveEntries can only be used within ArchiveEntry classes');
        }
        const newMethod = async (): Promise<File> => originalMethod.call(
          this,
          checksumBitmask,
          args,
        );

        if (!FileCache.enabled) {
          return newMethod();
        }

        return FileCache.getOrComputeFile(this.getFilePath(), checksumBitmask, newMethod);
      };
      return descriptor;
    };
  }

  static CacheArchiveEntries <T extends ArchiveEntry<Archive>>(
    cacheProps?: CacheArchiveEntriesProps,
  ): ArchiveEntriesDecorator<T> {
    return (
      target: object,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<ArchiveEntriesMethod<T>>,
    ): TypedPropertyDescriptor<ArchiveEntriesMethod<T>> => {
      const originalMethod = descriptor.value;
      if (!originalMethod) {
        throw new Error('@CacheArchiveEntries couldn\'t get a method from the descriptor');
      }

      // eslint-disable-next-line no-param-reassign,func-names
      descriptor.value = async function (checksumBitmask, args): Promise<T[]> {
        // NOTE(cemmer): `function` is required for `this` to bind correctly
        if (!(this instanceof Archive)) {
          throw new Error('@CacheArchiveEntries can only be used within Archive classes');
        }
        const newMethod = async (): Promise<T[]> => originalMethod.call(
          this,
          checksumBitmask,
          args,
        );

        if (!FileCache.enabled || checksumBitmask === cacheProps?.skipChecksumBitmask) {
          return newMethod();
        }

        return FileCache.getOrComputeEntries(this, checksumBitmask, newMethod);
      };
      return descriptor;
    };
  }

  private static getCacheKey(stats: Stats, valueType: ValueType): string {
    return `V${FileCache.VERSION}|${stats.ino}|${valueType}`;
  }

  private static async getCachedValue(
    filePath: string,
    valueType: ValueType,
    checksumBitmask: number,
  ): Promise<ArchiveEntriesCacheValue | undefined> {
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

    const existing = await (await this.CACHE).get(cacheKey) as ArchiveEntriesCacheValue | undefined;
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

    const existingBitmask = (existing.entries.every((file) => file.crc32 !== undefined && file.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
      | (existing.entries.every((file) => file.md5) ? ChecksumBitmask.MD5 : 0)
      | (existing.entries.every((file) => file.sha1) ? ChecksumBitmask.SHA1 : 0)
      | (existing.entries.every((file) => file.sha256) ? ChecksumBitmask.SHA256 : 0);
    const remainingBitmask = checksumBitmask ^ existingBitmask;
    if (remainingBitmask) {
      // We need checksums that haven't been cached yet
      return undefined;
    }

    return existing;
  }

  private static async getOrComputeFile(
    filePath: string,
    checksumBitmask: number,
    runnable: () => File | Promise<File>,
  ): Promise<File> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = this.getCacheKey(stats, ValueType.FILE);

    let result: File | undefined;
    const cached = await (await this.CACHE).getOrCompute(cacheKey, async () => {
      result = await runnable();
      return {
        fileSize: stats.size,
        modifiedTimeMillis: stats.mtimeMs,
        file: result.toObject(),
      } satisfies FileCacheValue;
    }) as FileCacheValue;

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

  private static async getOrComputeEntries<T extends ArchiveEntry<Archive>>(
    archive: Archive,
    checksumBitmask: number,
    runnable: () => T[] | Promise<T[]>,
  ): Promise<T[]> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(archive.getFilePath());
    const cacheKey = this.getCacheKey(stats, ValueType.ARCHIVE_ENTRIES);

    let result: T[] | undefined;
    const cached = await (await this.CACHE).getOrCompute(cacheKey, async () => {
      result = await runnable();
      return {
        fileSize: stats.size,
        modifiedTimeMillis: stats.mtimeMs,
        entries: result.map((file) => file.toObject()),
      } satisfies ArchiveEntriesCacheValue;
    }) as ArchiveEntriesCacheValue;

    if (result) {
      // Was computed, use the computed value
      return result;
    }
    // Otherwise, deserialize the cached value
    return Promise.all(cached.entries.map(async (props) => ArchiveEntry.entryOfObject(
      archive,
      {
        ...props,
        // Only return the checksums requested
        crc32: checksumBitmask & ChecksumBitmask.CRC32 ? props.crc32 : undefined,
        md5: checksumBitmask & ChecksumBitmask.MD5 ? props.md5 : undefined,
        sha1: checksumBitmask & ChecksumBitmask.SHA1 ? props.sha1 : undefined,
        sha256: checksumBitmask & ChecksumBitmask.SHA256 ? props.sha256 : undefined,
      } as ArchiveEntryProps<Archive>,
    ) as Promise<T>));
  }
}
