import Defaults from '../../globals/defaults.js';
import FsPoly from '../../polyfill/fsPoly.js';
import Timer from '../../timer.js';
import Cache from '../cache.js';
import Archive from './archives/archive.js';
import ArchiveEntry, { ArchiveEntryProps } from './archives/archiveEntry.js';
import File, { FileProps } from './file.js';
import { ChecksumBitmask } from './fileChecksums.js';
import FileSignature from './fileSignature.js';
import ROMHeader from './romHeader.js';

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
  value: number
  // getOrComputeFileChecksums()
  | FileProps
  // getOrComputeArchiveChecksums()
  | ArchiveEntryProps<Archive>[]
  // getOrComputeFileHeader(), getOrComputeFileSignature()
  | string | undefined,
}

const ValueType = {
  INODE: 'I',
  FILE_CHECKSUMS: 'F',
  ARCHIVE_CHECKSUMS: 'A',
  // ROM headers and file signatures may not be found for files, and that is a valid result that
  // gets cached. But when the list of known headers or signatures changes, we may be able to find
  // a non-undefined result. So these dynamic values help with cache busting.
  ROM_HEADER: `H${ROMHeader.getKnownHeaderCount()}`,
  FILE_SIGNATURE: `S${FileSignature.getKnownSignatureCount()}`,
};

export default class FileCache {
  private static readonly VERSION = 4;

  private cache: Cache<CacheValue> = new Cache<CacheValue>();

  private enabled = true;

  disable(): void {
    this.enabled = false;
  }

  async loadFile(cacheFilePath: string): Promise<void> {
    this.cache = await new Cache<CacheValue>({
      filePath: cacheFilePath,
      fileFlushMillis: 30_000,
      saveOnExit: true,
    }).load();

    // Cleanup the loaded cache file
    // Delete keys from old cache versions
    await this.cache.delete(new RegExp(`^V(${[...Array.from({ length: FileCache.VERSION }).keys()].slice(1).join('|')})\\|`));
    // Delete keys from old value types
    await this.cache.delete(new RegExp(`\\|(?!(${Object.values(ValueType).join('|')}))[^|]+$`));

    // Delete keys for deleted files
    const disks = FsPoly.disksSync();
    Timer.setTimeout(async () => {
      const cacheKeyFilePaths = [...this.cache.keys()]
        .filter((cacheKey) => cacheKey.endsWith(`|${ValueType.INODE}`))
        .map((cacheKey) => ([cacheKey, cacheKey.split('|')[1]]))
        // Don't delete the key if it's for a disk that isn't mounted right now
        .filter(([, filePath]) => disks.some((disk) => filePath.startsWith(disk)))
        // Only process a reasonably sized subset of the keys
        .sort(() => Math.random() - 0.5)
        .slice(0, Defaults.MAX_FS_THREADS);

      await Promise.all(cacheKeyFilePaths.map(async ([cacheKey, filePath]) => {
        if (!await FsPoly.exists(filePath)) {
          // Delete the related cache keys
          const inode = (await this.cache.get(cacheKey))?.value as number;
          await this.cache.delete(new RegExp(`^V${FileCache.VERSION}\\|${inode}\\|`));

          // Delete the inode key from the cache
          await this.cache.delete(cacheKey);
        }
      }));
    }, 5000);
  }

  async save(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.cache.save();
  }

  async getOrComputeFileChecksums(
    filePath: string,
    checksumBitmask: number,
  ): Promise<File> {
    if (!this.enabled || checksumBitmask === ChecksumBitmask.NONE) {
      return File.fileOf({ filePath }, checksumBitmask);
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = await this.getCacheKey(filePath, ValueType.FILE_CHECKSUMS);

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

  async getOrComputeArchiveChecksums<T extends Archive>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Archive>[]> {
    if (!this.enabled || checksumBitmask === ChecksumBitmask.NONE) {
      return archive.getArchiveEntries(checksumBitmask);
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(archive.getFilePath());
    const cacheKey = await this.getCacheKey(archive.getFilePath(), ValueType.ARCHIVE_CHECKSUMS);

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

  async getOrComputeFileHeader(file: File): Promise<ROMHeader | undefined> {
    if (!this.enabled) {
      return file.createReadStream(
        async (stream) => ROMHeader.headerFromFileStream(stream),
      );
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(file.getFilePath());
    const cacheKey = await this.getCacheKey(file.getFilePath(), ValueType.ROM_HEADER);

    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const header = await file.createReadStream(
          async (stream) => ROMHeader.headerFromFileStream(stream),
        );
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: header?.getName(),
        };
      },
      (cached) => {
        if (cached.fileSize !== stats.size || cached.modifiedTimeMillis !== stats.mtimeMs) {
          // Recompute if the file has changed since being cached
          return true;
        }
        // Recompute if the cached value isn't known
        return typeof cached.value === 'string' && !ROMHeader.headerFromName(cached.value);
      },
    );

    const cachedHeaderName = cachedValue.value as string | undefined;
    if (!cachedHeaderName) {
      return undefined;
    }
    return ROMHeader.headerFromName(cachedHeaderName);
  }

  async getOrComputeFileSignature(file: File): Promise<FileSignature | undefined> {
    if (!this.enabled) {
      return file.createReadStream(
        async (stream) => FileSignature.signatureFromFileStream(stream),
      );
    }

    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(file.getFilePath());
    const cacheKey = await this.getCacheKey(file.getFilePath(), ValueType.FILE_SIGNATURE);

    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const signature = await file.createReadStream(
          async (stream) => FileSignature.signatureFromFileStream(stream),
        );
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: signature?.getName(),
        };
      },
      (cached) => {
        if (cached.fileSize !== stats.size || cached.modifiedTimeMillis !== stats.mtimeMs) {
          // File has changed since being cached
          return true;
        }
        // Recompute if the cached value isn't known
        return typeof cached.value === 'string' && !FileSignature.signatureFromName(cached.value);
      },
    );

    const cachedSignatureName = cachedValue.value as string | undefined;
    if (!cachedSignatureName) {
      return undefined;
    }
    return FileSignature.signatureFromName(cachedSignatureName);
  }

  private async getCacheKey(filePath: string, valueType: string): Promise<string> {
    const stats = await FsPoly.stat(filePath);
    const inodeKey = `V${FileCache.VERSION}|${filePath}|${ValueType.INODE}`;
    await this.cache.set(inodeKey, {
      fileSize: stats.size,
      modifiedTimeMillis: stats.mtimeMs,
      value: stats.ino,
    });

    return `V${FileCache.VERSION}|${stats.ino}|${valueType}`;
  }
}
