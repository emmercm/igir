import Timer from '../../async/timer.js';
import Defaults from '../../globals/defaults.js';
import FsPoly from '../../polyfill/fsPoly.js';
import type { FsReadCallback } from '../../polyfill/fsReadTransform.js';
import Cache from '../cache.js';
import type Archive from './archives/archive.js';
import type { ArchiveEntryProps } from './archives/archiveEntry.js';
import ArchiveEntry from './archives/archiveEntry.js';
import type { FileProps } from './file.js';
import File from './file.js';
import FileChecksums, { ChecksumBitmask } from './fileChecksums.js';
import FileSignature from './fileSignature.js';
import ROMHeader from './romHeader.js';
import type { ROMPaddingProps } from './romPadding.js';
import ROMPadding from './romPadding.js';

interface CacheValue {
  fileSize: number;
  modifiedTimeMillis: number;
  value:
    | number
    // getOrComputeFileChecksums()
    | FileProps
    // getOrComputeArchiveChecksums()
    | ArchiveEntryProps<Archive>[]
    // getOrComputeFileHeader(), getOrComputeFileSignature()
    | string
    | undefined
    // getOrComputeFilePaddings()
    | ROMPaddingProps[];
}

const ValueType = {
  FILE_CHECKSUMS: 'F',
  ARCHIVE_CHECKSUMS: 'A',
  // ROM headers and file signatures may not be found for files, and that is a valid result that
  // gets cached. But when the list of known headers or signatures changes, we may be able to find
  // a non-undefined result. So these dynamic values help with cache busting.
  ROM_HEADER: `H${ROMHeader.getKnownHeaderCount()}`,
  FILE_SIGNATURE: `S${FileSignature.SIGNATURES.length}`,
  ROM_PADDING: `P${ROMPadding.getKnownFillBytesCount()}`,
};

export default class FileCache {
  private static readonly VERSION = 5;

  private cache: Cache<CacheValue> = new Cache<CacheValue>();

  private enabled = true;

  disable(): void {
    this.enabled = false;
  }

  async loadFile(cacheFilePath: string): Promise<void> {
    this.cache = await new Cache<CacheValue>({
      filePath: cacheFilePath,
      fileFlushMillis: 60_000,
      saveOnExit: true,
    }).load();

    // Cleanup the loaded cache file
    // Delete keys from old cache versions
    await this.cache.delete(
      new RegExp(
        `^V(${[...Array.from({ length: FileCache.VERSION }).keys()].slice(1).join('|')})\\|`,
      ),
    );
    // Delete keys from old value types
    await this.cache.delete(new RegExp(`\\|(?!(${Object.values(ValueType).join('|')}))[^|]+$`));

    // Delete keys for deleted files
    Timer.setTimeout(async () => {
      const cacheKeyFilePaths = [...this.cache.keys()]
        .map((cacheKey): [string, string] => [cacheKey, cacheKey.split('|')[1]])
        // Don't delete the key if it's for a disk that isn't mounted right now
        .filter(([, filePath]) => FsPoly.diskResolved(filePath) !== undefined)
        // Only process a reasonably sized subset of the keys
        .toSorted(() => Math.random() - 0.5)
        .slice(0, Defaults.MAX_FS_THREADS);

      await Promise.all(
        cacheKeyFilePaths.map(async ([cacheKey, filePath]) => {
          if (!(await FsPoly.exists(filePath))) {
            // Delete the file path key from the cache
            await this.cache.delete(cacheKey);
          }
        }),
      );
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
    callback?: FsReadCallback,
  ): Promise<File> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(filePath);
    const cacheKey = this.getCacheKey(filePath, undefined, ValueType.FILE_CHECKSUMS);

    // NOTE(cemmer): we're using the cache as a mutex here, so even if this function is called
    //  multiple times concurrently, entries will only be fetched once.
    let computedFile: File | undefined;
    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const checksums = await FileChecksums.hashFile(
          filePath,
          checksumBitmask,
          undefined,
          undefined,
          callback,
        );
        computedFile = await File.fileOf({ filePath, ...checksums }, checksumBitmask);
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
        const existingBitmask =
          (cachedFile.crc32 ? ChecksumBitmask.CRC32 : 0) |
          (cachedFile.md5 ? ChecksumBitmask.MD5 : 0) |
          (cachedFile.sha1 ? ChecksumBitmask.SHA1 : 0) |
          (cachedFile.sha256 ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask - (checksumBitmask & existingBitmask);
        // We need checksums that haven't been cached yet
        return remainingBitmask > 0;
      },
    );

    if (computedFile) {
      // If we computed the file (cache miss), then just return that vs. needing to deserialize
      //  what was written to the cache
      return computedFile;
    }

    // We didn't compute the file (cache hit), deserialize the properties into a full object
    const cachedFile = cachedValue.value as FileProps;
    return await File.fileOfObject(filePath, cachedFile);
  }

  async getOrComputeArchiveChecksums<T extends Archive>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(archive.getFilePath());
    if (stats.size === 0) {
      // An empty file can't have entries
      return [];
    }
    const cacheKey = this.getCacheKey(
      archive.getFilePath(),
      archive.constructor.name,
      ValueType.ARCHIVE_CHECKSUMS,
    );

    // NOTE(cemmer): we're using the cache as a mutex here, so even if this function is called
    //  multiple times concurrently, entries will only be fetched once.
    let computedEntries: ArchiveEntry<T>[] | undefined;
    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        computedEntries = (await archive.getArchiveEntries(checksumBitmask)) as ArchiveEntry<T>[];
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
        if (cachedEntries.length === 0) {
          // A quick checksum scan may have prevented us from getting any entries from an archive
          // (such as bin/cue CHDs), assume we want to re-scan the archive
          return true;
        }
        const existingBitmask =
          (cachedEntries.every((props) => props.crc32 !== undefined) ? ChecksumBitmask.CRC32 : 0) |
          (cachedEntries.every((props) => props.md5 !== undefined) ? ChecksumBitmask.MD5 : 0) |
          (cachedEntries.every((props) => props.sha1 !== undefined) ? ChecksumBitmask.SHA1 : 0) |
          (cachedEntries.every((props) => props.sha256 !== undefined) ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask - (checksumBitmask & existingBitmask);
        // We need checksums that haven't been cached yet
        return remainingBitmask > 0;
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
    return await Promise.all(
      cachedEntries.map(async (props) => await ArchiveEntry.entryOfObject(archive, props)),
    );
  }

  async getOrComputeFileHeader(file: File): Promise<ROMHeader | undefined> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(file.getFilePath());
    if (stats.size === 0) {
      // An empty file can't have a header
      return undefined;
    }
    const cacheKey = this.getCacheKey(
      file.getFilePath(),
      file instanceof ArchiveEntry ? file.getEntryPath() : undefined,
      ValueType.ROM_HEADER,
    );

    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const header = await file.createReadStream(
          async (readable) => await ROMHeader.headerFromFileStream(readable),
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
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(file.getFilePath());
    if (stats.size === 0) {
      // An empty file can't have a signature
      return undefined;
    }
    const cacheKey = this.getCacheKey(
      file.getFilePath(),
      file instanceof ArchiveEntry ? file.getEntryPath() : undefined,
      ValueType.FILE_SIGNATURE,
    );

    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const signature = await file.createReadStream(
          async (readable) => await FileSignature.signatureFromFileStream(readable),
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

  async getOrComputeFilePaddings(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsPoly.stat(file.getFilePath());
    if (stats.size === 0) {
      // An empty file can't have any padding
      return [];
    }
    const cacheKey = this.getCacheKey(
      file.getFilePath(),
      file instanceof ArchiveEntry ? file.getEntryPath() : undefined,
      ValueType.ROM_PADDING,
    );

    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        const paddings = await ROMPadding.paddingsFromFile(file, callback);
        return {
          fileSize: stats.size,
          modifiedTimeMillis: stats.mtimeMs,
          value: paddings.map((padding) => padding.toROMPaddingProps()),
        };
      },
      (cached) => {
        if (cached.fileSize !== stats.size || cached.modifiedTimeMillis !== stats.mtimeMs) {
          // Recompute if the file has changed since being cached
          return true;
        }

        const cachedPadding = cached.value as ROMPaddingProps[];
        const checksumBitmask = file.getChecksumBitmask();
        const existingBitmask =
          (cachedPadding.every((props) => props.crc32 !== undefined) ? ChecksumBitmask.CRC32 : 0) |
          (cachedPadding.every((props) => props.md5 !== undefined) ? ChecksumBitmask.MD5 : 0) |
          (cachedPadding.every((props) => props.sha1 !== undefined) ? ChecksumBitmask.SHA1 : 0) |
          (cachedPadding.every((props) => props.sha256 !== undefined) ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask - (checksumBitmask & existingBitmask);
        // We need checksums that haven't been cached yet
        return remainingBitmask > 0;
      },
    );

    const cachedPaddingsJson = cachedValue.value as ROMPaddingProps[];
    return cachedPaddingsJson.map((props) => ROMPadding.fileOfObject(props));
  }

  private getCacheKey(filePath: string, entryPath: string | undefined, valueType: string): string {
    return `V${FileCache.VERSION}|${filePath}|${entryPath ?? ''}|${valueType}`;
  }
}
