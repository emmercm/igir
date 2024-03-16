import { Stats } from 'node:fs';

import Constants from '../../constants.js';
import FsPoly from '../../polyfill/fsPoly.js';
import Cache from '../cache.js';
import Archive from './archives/archive.js';
import ArchiveEntry, { ArchiveEntryProps } from './archives/archiveEntry.js';
import File from './file.js';
import { ChecksumBitmask, ChecksumProps } from './fileChecksums.js';

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

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
  files: ChecksumProps[],
}

export default class FileCache {
  private static readonly CACHE = new Cache<CacheValue>({
    filePath: process.env.NODE_ENV !== 'test' ? Constants.GLOBAL_CACHE_FILE : undefined,
    fileFlushMillis: 30_000,
  }).load();

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
        // Should never happen, a method should always be available
        return descriptor;
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

        if (checksumBitmask === cacheProps?.skipChecksumBitmask) {
          return newMethod();
        }

        const cachedValue = await FileCache.getCachedValue(this.getFilePath(), checksumBitmask);
        if (cachedValue) {
          return Promise.all(cachedValue.files.map(async (props) => ArchiveEntry.entryOfObject(
            this,
            {
              ...props,
              // Only return the checksums requested
              crc32: checksumBitmask & ChecksumBitmask.CRC32 ? props.crc32 : undefined,
              md5: checksumBitmask & ChecksumBitmask.MD5 ? props.md5 : undefined,
              sha1: checksumBitmask & ChecksumBitmask.SHA1 ? props.sha1 : undefined,
            } as ArchiveEntryProps<Archive>,
          ) as Promise<T>));
        }

        return FileCache.computeAndSet(this.getFilePath(), newMethod);
      };
      return descriptor;
    };
  }

  private static getCacheKey(stats: Stats): string {
    return String(stats.ino);
  }

  private static async getCachedValue(
    filePath: string,
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
    const cacheKey = this.getCacheKey(stats);

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

    const existingBitmask = (existing.files.every((file) => file.crc32 !== undefined && file.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
      | (existing.files.every((file) => file.md5) ? ChecksumBitmask.MD5 : 0)
      | (existing.files.every((file) => file.sha1) ? ChecksumBitmask.SHA1 : 0);
    const remainingBitmask = checksumBitmask ^ existingBitmask;
    if (remainingBitmask) {
      // We need checksums that haven't been cached yet
      return undefined;
    }

    return existing;
  }

  private static async computeAndSet<T extends File>(
    filePath: string,
    runnable: () => T[] | Promise<T[]>,
  ): Promise<T[]> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = this.getCacheKey(stats);

    const files = await runnable();
    await (await this.CACHE).set(cacheKey, {
      fileSize: stats.size,
      modifiedTimeMillis: stats.mtimeMs,
      files: files.map((file) => file.toObject()),
    });
    return files;
  }
}
