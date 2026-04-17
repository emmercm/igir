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
  fileSize?: number;
  modifiedTimeSec?: number;
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
} as const;
type ValueTypeKey = keyof typeof ValueType;
type ValueTypeValue = (typeof ValueType)[ValueTypeKey];

export default class FileCache {
  private static readonly VERSION = 6;

  private cache: Cache<CacheValue> = new Cache<CacheValue>();

  private enabled = true;

  disable(): void {
    this.enabled = false;
  }

  async loadFile(cacheFilePath: string): Promise<void> {
    this.cache = await new Cache<CacheValue>({
      filePath: cacheFilePath,
      fileFlushMillis: 120_000,
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
    forceRecompute = false,
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
          modifiedTimeSec: stats.mtimeS,
          value: computedFile.toFileProps(),
        };
      },
      (cached) => {
        if (forceRecompute) {
          return true;
        }

        if (cached.fileSize !== stats.size || cached.modifiedTimeSec !== stats.mtimeS) {
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
    forceRecompute = false,
    callback?: FsReadCallback,
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
        computedEntries = (await archive.getArchiveEntries(
          checksumBitmask,
          callback,
        )) as ArchiveEntry<T>[];
        return {
          fileSize: stats.size,
          modifiedTimeSec: stats.mtimeS,
          value: computedEntries.map((entry) => entry.toEntryProps()),
        };
      },
      (cached) => {
        if (forceRecompute) {
          return true;
        }

        if (cached.fileSize !== stats.size || cached.modifiedTimeSec !== stats.mtimeS) {
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
    if (file.getSize() === 0) {
      // An empty file can't have a header
      return undefined;
    }

    const computeHeader = async (): Promise<ROMHeader | undefined> => {
      return await file.createReadStream(
        async (readable) => await ROMHeader.headerFromFileStream(readable),
      );
    };

    const cacheKeys = this.getChecksumCacheKeys(file, ValueType.ROM_HEADER);
    const usingFilePathKey = cacheKeys.length === 0;
    if (usingFilePathKey) {
      // No checksums available to use as cache keys, fall back to file path
      cacheKeys.push(this.getCacheKey(file.getFilePath(), undefined, ValueType.ROM_HEADER));
    }

    // When using file-path-based keys, we need file stats to detect stale cache entries
    const stats = usingFilePathKey ? await FsPoly.stat(file.getFilePath()) : undefined;

    const cachedValue = await this.cache.getOrComputeAnyKeys(
      cacheKeys,
      async () => {
        const header = await computeHeader();
        return {
          fileSize: stats?.size,
          modifiedTimeSec: stats?.mtimeS,
          value: header?.getName(),
        };
      },
      (cached) => {
        if (
          stats !== undefined &&
          (cached.fileSize !== stats.size || cached.modifiedTimeSec !== stats.mtimeS)
        ) {
          // File has changed since being cached
          return true;
        }
        // Recompute if the cached value isn't valid or isn't known
        return typeof cached.value !== 'string' || !ROMHeader.headerFromName(cached.value);
      },
    );

    const cachedHeaderName = cachedValue?.value as string | undefined;
    if (!cachedHeaderName) {
      return undefined;
    }
    return ROMHeader.headerFromName(cachedHeaderName);
  }

  async getOrComputeFileSignature(
    file: File,
    callback?: FsReadCallback,
  ): Promise<FileSignature | undefined> {
    if (file.getSize() === 0) {
      // An empty file can't have a signature
      return undefined;
    }

    const computeSignature = async (): Promise<FileSignature | undefined> => {
      return await file.createReadStream(
        async (readable) => await FileSignature.signatureFromFileStream(readable, callback),
      );
    };

    const cacheKeys = this.getChecksumCacheKeys(file, ValueType.FILE_SIGNATURE);
    const usingFilePathKey = cacheKeys.length === 0;
    if (usingFilePathKey) {
      // No checksums available to use as cache keys, fall back to file path
      // This can happen when correcting an ArchiveFile's extension
      cacheKeys.push(this.getCacheKey(file.getFilePath(), undefined, ValueType.FILE_SIGNATURE));
    }

    // When using file-path-based keys, we need file stats to detect stale cache entries
    const stats = usingFilePathKey ? await FsPoly.stat(file.getFilePath()) : undefined;

    const cachedValue = await this.cache.getOrComputeAnyKeys(
      cacheKeys,
      async () => {
        const signature = await computeSignature();
        return {
          fileSize: stats?.size,
          modifiedTimeSec: stats?.mtimeS,
          value: signature?.getName(),
        };
      },
      (cached) => {
        if (
          stats !== undefined &&
          (cached.fileSize !== stats.size || cached.modifiedTimeSec !== stats.mtimeS)
        ) {
          // File has changed since being cached
          return true;
        }
        // Recompute if the cached value isn't valid or isn't known
        return typeof cached.value !== 'string' || !FileSignature.signatureFromName(cached.value);
      },
    );

    const cachedSignatureName = cachedValue?.value as string | undefined;
    if (!cachedSignatureName) {
      return undefined;
    }
    return FileSignature.signatureFromName(cachedSignatureName);
  }

  async getOrComputeFilePaddings(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    if (file.getSize() === 0) {
      // An empty file can't have any padding
      return [];
    }

    const cacheKeys = this.getChecksumCacheKeys(file, ValueType.ROM_PADDING);
    if (cacheKeys.length === 0) {
      // No checksums available to use as cache keys, compute without caching
      return await ROMPadding.paddingsFromFile(file, callback);
    }

    const activeChecksums = Object.values(ChecksumBitmask).filter(
      (bitmask) => file.getChecksumBitmask() & bitmask,
    );
    const cachedResults = await this.cache.getOrComputeAllKeys(cacheKeys, async () => {
      const paddings = await ROMPadding.paddingsFromFile(file, callback);
      const paddingProps = paddings.map((padding) => padding.toROMPaddingProps());

      const resultMap = new Map<string, CacheValue>();
      for (const [i, bitmask] of activeChecksums.entries()) {
        const perTypePaddings: ROMPaddingProps[] = paddingProps.map((props) => ({
          paddedSize: props.paddedSize,
          fillByte: props.fillByte,
          ...(bitmask === ChecksumBitmask.CRC32 && props.crc32 !== undefined
            ? { crc32: props.crc32 }
            : {}),
          ...(bitmask === ChecksumBitmask.MD5 && props.md5 !== undefined ? { md5: props.md5 } : {}),
          ...(bitmask === ChecksumBitmask.SHA1 && props.sha1 !== undefined
            ? { sha1: props.sha1 }
            : {}),
          ...(bitmask === ChecksumBitmask.SHA256 && props.sha256 !== undefined
            ? { sha256: props.sha256 }
            : {}),
        }));
        resultMap.set(cacheKeys[i], { value: perTypePaddings });
      }
      return resultMap;
    });

    // Merge per-type cached results into complete ROMPadding objects
    const fillByteToRomPaddingProps = new Map<number, ROMPaddingProps>();
    for (const cacheValue of cachedResults.values()) {
      const paddingPropsList = cacheValue.value as ROMPaddingProps[];
      for (const element of paddingPropsList.values()) {
        const existing = fillByteToRomPaddingProps.get(element.fillByte) ?? {
          paddedSize: element.paddedSize,
          fillByte: element.fillByte,
        };
        fillByteToRomPaddingProps.set(element.fillByte, {
          ...existing,
          ...(element.crc32 === undefined ? {} : { crc32: element.crc32 }),
          ...(element.md5 === undefined ? {} : { md5: element.md5 }),
          ...(element.sha1 === undefined ? {} : { sha1: element.sha1 }),
          ...(element.sha256 === undefined ? {} : { sha256: element.sha256 }),
        });
      }
    }
    return [...fillByteToRomPaddingProps.values()].map((props) => new ROMPadding(props));
  }

  private getChecksumCacheKeys(file: File, valueType: ValueTypeValue): string[] {
    const checksumEntries: [number, string | undefined][] = [
      [
        ChecksumBitmask.CRC32,
        file.getCrc32() === undefined ? undefined : `${file.getCrc32()}:${file.getSize()}`,
      ],
      [ChecksumBitmask.MD5, file.getMd5()],
      [ChecksumBitmask.SHA1, file.getSha1()],
      [ChecksumBitmask.SHA256, file.getSha256()],
    ];
    return checksumEntries
      .filter(
        (entry): entry is [number, string] =>
          (file.getChecksumBitmask() & entry[0]) > 0 && entry[1] !== undefined,
      )
      .map(([, checksum]) => this.getCacheKey('', checksum, valueType));
  }

  private getCacheKey(
    fileIdentifier: string,
    fileSubIdentifier: string | undefined,
    valueType: ValueTypeValue,
  ): string {
    return `V${FileCache.VERSION}|${fileIdentifier}|${fileSubIdentifier ?? ''}|${valueType}`;
  }
}
