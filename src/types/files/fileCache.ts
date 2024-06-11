import Constants from '../../constants.js';
import FsPoly from '../../polyfill/fsPoly.js';
import Timer from '../../timer.js';
import Cache from '../cache.js';
import Archive from './archives/archive.js';
import ArchiveEntry, { ArchiveEntryProps } from './archives/archiveEntry.js';
import File, { FileProps } from './file.js';
import { ChecksumBitmask } from './fileChecksums.js';

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
  value: FileProps | ArchiveEntryProps<Archive>[],
}

enum ValueType {
  FILE = 'F',
  ARCHIVE_ENTRIES = 'A',
}

export default class FileCache {
  private static readonly VERSION = 3;

  private static cache: Cache<CacheValue> = new Cache<CacheValue>();

  private static enabled = true;

  public static disable(): void {
    this.enabled = false;
  }

  public static async loadFile(filePath: string): Promise<void> {
    this.cache = await new Cache<CacheValue>({
      filePath,
      fileFlushMillis: 30_000,
    }).load();

    // Cleanup the loaded cache file
    // Delete keys from old cache versions
    await Promise.all([...Array.from({ length: FileCache.VERSION }).keys()].slice(1)
      .map(async (prevVersion) => {
        const keyRegex = new RegExp(`^V${prevVersion}\\|`);
        return this.cache.delete(keyRegex);
      }));

    // Delete keys for deleted files
    const disks = FsPoly.disksSync();
    Timer.setTimeout(async () => {
      await Promise.all([...this.cache.keys()]
        .map((cacheKey) => cacheKey.split('|')[1])
        // Don't delete the key if it's for a disk that isn't mounted right now
        .filter((cacheKeyFilePath) => disks.some((disk) => cacheKeyFilePath.startsWith(disk)))
        // Only process a reasonably sized subset of the keys
        .sort(() => Math.random() - 0.5)
        .slice(0, Constants.MAX_FS_THREADS)
        .map(async (cacheKeyFilePath) => {
          if (!await FsPoly.exists(cacheKeyFilePath)) {
            // If the file no longer exists, then delete its key from the cache
            await this.cache.delete(cacheKeyFilePath);
          }
        }));
    }, 10_000);
  }

  public static async save(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.cache.save();
  }

  static async getOrComputeFile(
    filePath: string,
    checksumBitmask: number,
  ): Promise<File> {
    if (!this.enabled || checksumBitmask === ChecksumBitmask.NONE) {
      return File.fileOf({ filePath }, checksumBitmask);
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = this.getCacheKey(filePath, ValueType.FILE);

    // NOTE(cemmer): we're using the cache as a mutex here, so even if this function is called
    //  multiple times concurrently, entries will only be fetched once.
    let computedFile: File | undefined;
    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        computedFile = await File.fileOf({ filePath }, checksumBitmask);
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: computedFile.toFileProps(),
        };
      },
      (cached) => {
        if (cached.fileSize !== stats.size || cached.modifiedTimeMillis !== stats.mtimeMs) {
          // File has changed since being cached
          return true;
        }

        const cachedFile = cached.value as FileProps;
        const existingBitmask = ((cachedFile.crc32 !== undefined && cachedFile.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
          | (cachedFile.md5 ? ChecksumBitmask.MD5 : 0)
          | (cachedFile.sha1 ? ChecksumBitmask.SHA1 : 0)
          | (cachedFile.sha256 ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask ^ existingBitmask;
        // We need checksums that haven't been cached yet
        return remainingBitmask !== 0;
      },
    );

    if (computedFile) {
      // If we computed the file (cache miss), then just return that vs. needing to deserialize
      //  what was written to the cache
      return computedFile;
    }

    // We didn't compute the file (cache hit), deserialize the properties into a full object
    const cachedFile = cachedValue.value as FileProps;
    return File.fileOfObject(filePath, {
      ...cachedFile,
      // Only return the checksums requested
      crc32: checksumBitmask & ChecksumBitmask.CRC32 ? cachedFile.crc32 : undefined,
      md5: checksumBitmask & ChecksumBitmask.MD5 ? cachedFile.md5 : undefined,
      sha1: checksumBitmask & ChecksumBitmask.SHA1 ? cachedFile.sha1 : undefined,
      sha256: checksumBitmask & ChecksumBitmask.SHA256 ? cachedFile.sha256 : undefined,
    });
  }

  static async getOrComputeEntries<T extends Archive>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    if (!this.enabled || checksumBitmask === ChecksumBitmask.NONE) {
      return archive.getArchiveEntries(checksumBitmask);
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(archive.getFilePath());
    const cacheKey = this.getCacheKey(archive.getFilePath(), ValueType.ARCHIVE_ENTRIES);

    // NOTE(cemmer): we're using the cache as a mutex here, so even if this function is called
    //  multiple times concurrently, entries will only be fetched once.
    let computedEntries: ArchiveEntry<T>[] | undefined;
    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        computedEntries = await archive.getArchiveEntries(checksumBitmask) as ArchiveEntry<T>[];
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: computedEntries.map((entry) => entry.toEntryProps()),
        };
      },
      (cached) => {
        if (cached.fileSize !== stats.size || cached.modifiedTimeMillis !== stats.mtimeMs) {
          // File has changed since being cached
          return true;
        }

        const cachedEntries = cached.value as ArchiveEntryProps<T>[];
        const existingBitmask = (cachedEntries.every((props) => props.crc32 !== undefined && props.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
          | (cachedEntries.every((props) => props.md5) ? ChecksumBitmask.MD5 : 0)
          | (cachedEntries.every((props) => props.sha1) ? ChecksumBitmask.SHA1 : 0)
          | (cachedEntries.every((props) => props.sha256) ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask ^ existingBitmask;
        // We need checksums that haven't been cached yet
        return remainingBitmask !== 0;
      },
    );

    if (computedEntries) {
      // If we computed the archive entries (cache miss), then just return that vs. needing to
      //  deserialize what was written to the cache
      return computedEntries;
    }

    // We didn't compute the archive entries (cache hit), deserialize the properties into
    //  full objects
    const cachedEntries = cachedValue.value as ArchiveEntryProps<T>[];
    return Promise.all(cachedEntries.map(async (props) => ArchiveEntry.entryOfObject(archive, {
      ...props,
      // Only return the checksums requested
      crc32: checksumBitmask & ChecksumBitmask.CRC32 ? props.crc32 : undefined,
      md5: checksumBitmask & ChecksumBitmask.MD5 ? props.md5 : undefined,
      sha1: checksumBitmask & ChecksumBitmask.SHA1 ? props.sha1 : undefined,
      sha256: checksumBitmask & ChecksumBitmask.SHA256 ? props.sha256 : undefined,
    })));
  }

  private static getCacheKey(filePath: string, valueType: ValueType): string {
    return `V${FileCache.VERSION}|${filePath}|${valueType}`;
  }
}
