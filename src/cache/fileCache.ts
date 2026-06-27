import type {
  ValidationResultKey,
  ValidationResultValue,
} from '../../packages/torrentzip/index.js';
import { ValidationResultInverted } from '../../packages/torrentzip/index.js';
import { TZValidator } from '../../packages/torrentzip/index.js';
import { ValidationResult } from '../../packages/torrentzip/index.js';
import { ZipReader } from '../../packages/zip/index.js';
import { logger } from '../console/logger.js';
import type Archive from '../models/files/archives/archive.js';
import type { ArchiveEntryProps } from '../models/files/archives/archiveEntry.js';
import ArchiveEntry from '../models/files/archives/archiveEntry.js';
import type Zip from '../models/files/archives/zip.js';
import type { FileProps } from '../models/files/file.js';
import File from '../models/files/file.js';
import FileChecksums, { ChecksumBitmask } from '../models/files/fileChecksums.js';
import FileSignature from '../models/files/fileSignature.js';
import ROMHeader from '../models/files/romHeader.js';
import type { ROMPaddingProps } from '../models/files/romPadding.js';
import ROMPadding from '../models/files/romPadding.js';
import type { FsReadCallback } from '../streams/fsReadTransform.js';
import FsUtil from '../utils/fsUtil.js';
import Cache from './cache.js';

interface CacheValue {
  fileSize?: number;
  modifiedTimeSec?: number;
  // We cache empty/undefined/falsey values in the cache, but whenever the list of possible results change, then we want
  // to retry this processing as it may become possible to get a truthy value. For example, if we add more known file
  // signatures, we want to retry processing "undefined"s as we may be able to find a signature now. "version" stores a
  // number that is meaningful to each function, usually how many headers/signatures/etc. that we know.
  version?: number;
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
  ROM_HEADER: 'H',
  FILE_SIGNATURE: 'S',
  ROM_PADDING: `P${ROMPadding.getKnownFillBytesCount()}`,
  TZ_VALIDATION: 'Z',
} as const;
type ValueTypeKey = keyof typeof ValueType;
type ValueTypeValue = (typeof ValueType)[ValueTypeKey];

/**
 * A persistent cache of file metadata (checksums, archive entries, ROM headers, signatures,
 * paddings, and TorrentZip validation results) keyed by file path or checksum.
 */
export default class FileCache {
  private static readonly VERSION = 6;

  private cache: Cache<CacheValue> = new Cache<CacheValue>();

  private enabled = true;

  private readonly prefixedLogger = logger.child(FileCache.name);

  /**
   * Disable the cache, preventing it from being persisted to disk on {@link save}.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Load the cache from a file on disk, then prune entries from older cache versions or stale
   * value types so subsequent lookups only consider entries compatible with the current schema.
   */
  async loadFile(cacheFilePath: string): Promise<void> {
    this.prefixedLogger.trace(`loading: ${cacheFilePath}`);

    this.cache = await new Cache<CacheValue>({
      filePath: cacheFilePath,
      fileFlushMillis: 5 * 60 * 1000,
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
    // Delete old versioned header/signature/validation keys (pre-version-in-value migration)
    await this.cache.delete(/\|[HSZ]\d+$/);

    this.prefixedLogger.trace(`loaded: ${cacheFilePath}`);
  }

  /**
   * Persist the cache to its backing file, unless the cache has been disabled.
   */
  async save(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.prefixedLogger.trace(`saving: ${this.cache.getFilePath()}`);
    await this.cache.save();
    this.prefixedLogger.trace(`saved: ${this.cache.getFilePath()}`);
  }

  async getOrComputeFileChecksums(
    filePath: string,
    checksumBitmask: number,
    callback?: FsReadCallback,
    shouldForceRecompute = false,
  ): Promise<File> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsUtil.stat(filePath);
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
        if (shouldForceRecompute) {
          return true;
        }

        // File has changed since being cached?
        if (cached.fileSize !== stats.size) {
          this.prefixedLogger.trace(
            `${filePath}: cache miss, cached file size ${cached.fileSize} !== real size ${stats.size}`,
          );
          return true;
        }
        if (cached.modifiedTimeSec !== stats.mtimeS) {
          this.prefixedLogger.trace(
            `${filePath}: cache miss, cached file mtime ${cached.modifiedTimeSec} !== real mtime ${stats.mtimeS}`,
          );
          return true;
        }

        const cachedFile = cached.value as FileProps;
        const existingBitmask =
          (cachedFile.crc32 ? ChecksumBitmask.CRC32 : 0) |
          (cachedFile.md5 ? ChecksumBitmask.MD5 : 0) |
          (cachedFile.sha1 ? ChecksumBitmask.SHA1 : 0) |
          (cachedFile.sha256 ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask - (checksumBitmask & existingBitmask);
        if (remainingBitmask > 0) {
          // We need checksums that haven't been cached yet
          this.prefixedLogger.trace(
            `${filePath}: cache miss, cache is missing: ${FileChecksums.checksumBitmaskString(remainingBitmask)}`,
          );
          return true;
        }
        return false;
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
    shouldForceRecompute = false,
    callback?: FsReadCallback,
    shouldForceChecksumCalculation = false,
  ): Promise<ArchiveEntry<T>[]> {
    // NOTE(cemmer): we're explicitly not catching ENOENT errors here, we want it to bubble up
    const stats = await FsUtil.stat(archive.getFilePath());
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
          shouldForceChecksumCalculation,
        )) as ArchiveEntry<T>[];
        return {
          fileSize: stats.size,
          modifiedTimeSec: stats.mtimeS,
          value: computedEntries.map((entry) => entry.toEntryProps()),
        };
      },
      (cached) => {
        if (shouldForceRecompute) {
          return true;
        }

        // File has changed since being cached?
        if (cached.fileSize !== stats.size) {
          this.prefixedLogger.trace(
            `${archive.getFilePath()}: cache miss, cached file size ${cached.fileSize} !== real size ${stats.size}`,
          );
          return true;
        }
        if (cached.modifiedTimeSec !== stats.mtimeS) {
          this.prefixedLogger.trace(
            `${archive.getFilePath()}: cache miss, cached file mtime ${cached.modifiedTimeSec} !== real mtime ${stats.mtimeS}`,
          );
          return true;
        }

        const cachedEntries = cached.value as ArchiveEntryProps<T>[];
        if (cachedEntries.length === 0) {
          // A quick checksum scan may have prevented us from getting any entries from an archive
          // (such as bin/cue CHDs), assume we want to re-scan the archive
          this.prefixedLogger.trace(
            `${archive.getFilePath()}: cache miss, cache has zero archive entries`,
          );
          return true;
        }
        const existingBitmask =
          (cachedEntries.every((props) => props.crc32 !== undefined) ? ChecksumBitmask.CRC32 : 0) |
          (cachedEntries.every((props) => props.md5 !== undefined) ? ChecksumBitmask.MD5 : 0) |
          (cachedEntries.every((props) => props.sha1 !== undefined) ? ChecksumBitmask.SHA1 : 0) |
          (cachedEntries.every((props) => props.sha256 !== undefined) ? ChecksumBitmask.SHA256 : 0);
        const remainingBitmask = checksumBitmask - (checksumBitmask & existingBitmask);
        if (remainingBitmask > 0) {
          // We need checksums that haven't been cached yet
          this.prefixedLogger.trace(
            `${archive.getFilePath()}: cache miss, cache is missing: ${FileChecksums.checksumBitmaskString(remainingBitmask)}`,
          );
          return true;
        }
        return false;
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
    return await this.getOrComputeAny(
      file,
      ValueType.ROM_HEADER,
      ROMHeader.getKnownHeaderCount(),
      async () => {
        const header = await file.createReadStream(
          async (readable) => await ROMHeader.headerFromFileStream(readable),
        );
        return header?.getName();
      },
      (name) => ROMHeader.headerFromName(name),
    );
  }

  async getOrComputeFileSignature(
    file: File,
    callback?: FsReadCallback,
  ): Promise<FileSignature | undefined> {
    return await this.getOrComputeAny(
      file,
      ValueType.FILE_SIGNATURE,
      FileSignature.SIGNATURES.length,
      async () => {
        const signature = await file.createReadStream(
          async (readable) => await FileSignature.signatureFromFileStream(readable, callback),
        );
        return signature?.getName();
      },
      (name) => FileSignature.signatureFromName(name),
    );
  }

  /**
   * Shared logic for caching file header and file signature lookups. Both cache a name string
   * and reconstruct the object from that name on cache hit.
   */
  private async getOrComputeAny<T>(
    file: File,
    valueType: ValueTypeValue,
    currentVersion: number,
    runnable: () => Promise<string | undefined>,
    fromName: (name: string) => T | undefined,
  ): Promise<T | undefined> {
    if (file.getSize() === 0) {
      return undefined;
    }

    const cacheKeys = this.getChecksumCacheKeys(file, valueType);
    const isUsingFilePathKey = cacheKeys.length === 0;
    if (isUsingFilePathKey) {
      // No checksums available to use as cache keys, fall back to file path
      cacheKeys.push(this.getCacheKey(file.getFilePath(), undefined, valueType));
    }

    // When using file-path-based keys, we need file stats to detect stale cache entries
    const stats = isUsingFilePathKey ? await FsUtil.stat(file.getFilePath()) : undefined;

    const cachedValue = await this.cache.getOrComputeAnyKeys(
      cacheKeys,
      async () => {
        const name = await runnable();
        return {
          fileSize: stats?.size,
          modifiedTimeSec: stats?.mtimeS,
          version: currentVersion,
          value: name,
        };
      },
      (cached) => {
        // File has changed since being cached?
        if (stats !== undefined && cached.fileSize !== stats.size) {
          this.prefixedLogger.trace(
            `${file.getFilePath()}: cache miss, cached file size ${cached.fileSize} !== real size ${stats.size}`,
          );
          return true;
        }
        if (stats !== undefined && cached.modifiedTimeSec !== stats.mtimeS) {
          this.prefixedLogger.trace(
            `${file.getFilePath()}: cache miss, cached file mtime ${cached.modifiedTimeSec} !== real mtime ${stats.mtimeS}`,
          );
          return true;
        }

        if (cached.value === undefined) {
          // "Not found" is valid, only recompute if the known item list has changed
          if (cached.version !== currentVersion) {
            this.prefixedLogger.trace(
              `${file.getFilePath()}: cache miss, cached version ${cached.version} !== current version ${currentVersion}`,
            );
            return true;
          }
          return false;
        }

        // Recompute if the cached name no longer maps to a known item
        if (typeof cached.value !== 'string' || fromName(cached.value) === undefined) {
          this.prefixedLogger.trace(
            // eslint-disable-next-line @typescript-eslint/no-base-to-string,@typescript-eslint/restrict-template-expressions
            `${file.getFilePath()}: cache miss, cached value unrecognized: ${cached.value}`,
          );
          return true;
        }
        return false;
      },
    );

    const cachedName = cachedValue?.value as string | undefined;
    if (cachedName === undefined) {
      return undefined;
    }
    return fromName(cachedName);
  }

  async getOrComputeFilePaddings(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    if (file.getSize() === 0) {
      // An empty file can't have any padding
      return [];
    }

    const cacheKeys = this.getChecksumCacheKeys(file, ValueType.ROM_PADDING);
    if (cacheKeys.length === 0) {
      // No checksums available to use as cache keys, fall back to file path
      cacheKeys.push(this.getCacheKey(file.getFilePath(), undefined, ValueType.ROM_PADDING));
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
          ...(bitmask === ChecksumBitmask.CRC32 &&
            props.crc32 !== undefined && { crc32: props.crc32 }),
          ...(bitmask === ChecksumBitmask.MD5 && props.md5 !== undefined && { md5: props.md5 }),
          ...(bitmask === ChecksumBitmask.SHA1 && props.sha1 !== undefined && { sha1: props.sha1 }),
          ...(bitmask === ChecksumBitmask.SHA256 &&
            props.sha256 !== undefined && { sha256: props.sha256 }),
        }));
        resultMap.set(cacheKeys[i], { value: perTypePaddings });
      }
      return resultMap;
    });

    // Merge per-type cached results into complete ROMPadding objects
    const fillByteToRomPaddingProps = new Map<number, ROMPaddingProps>();
    for (const cacheValue of cachedResults.values()) {
      const paddingPropsList = cacheValue.value as ROMPaddingProps[];
      for (const element of paddingPropsList) {
        const existing = fillByteToRomPaddingProps.get(element.fillByte) ?? {
          paddedSize: element.paddedSize,
          fillByte: element.fillByte,
        };
        fillByteToRomPaddingProps.set(element.fillByte, {
          ...existing,
          ...(element.crc32 !== undefined && { crc32: element.crc32 }),
          ...(element.md5 !== undefined && { md5: element.md5 }),
          ...(element.sha1 !== undefined && { sha1: element.sha1 }),
          ...(element.sha256 !== undefined && { sha256: element.sha256 }),
        });
      }
    }
    return Array.from(fillByteToRomPaddingProps.values(), (props) => new ROMPadding(props));
  }

  async getOrComputeTzValidation(
    zip: Zip,
    shouldForceRecompute = false,
  ): Promise<ValidationResultValue> {
    if (!(await FsUtil.exists(zip.getFilePath()))) {
      return ValidationResult.INVALID;
    }

    const stats = await FsUtil.stat(zip.getFilePath());
    const currentVersion = Object.keys(ValidationResult).length;
    const cacheKey = this.getCacheKey(zip.getFilePath(), undefined, ValueType.TZ_VALIDATION);

    // NOTE(cemmer): we're using the cache as a mutex here, so even if this function is called
    //  multiple times concurrently, entries will only be fetched once.
    const cachedValue = await this.cache.getOrCompute(
      cacheKey,
      async () => {
        let result: ValidationResultValue;
        try {
          result = await TZValidator.validate(new ZipReader(zip.getFilePath()));
        } catch {
          result = ValidationResult.INVALID;
        }
        return {
          fileSize: stats.size,
          modifiedTimeSec: stats.mtimeS,
          version: currentVersion,
          value: ValidationResultInverted[result],
        };
      },
      (cached) => {
        if (shouldForceRecompute) {
          return true;
        }

        // File has changed since being cached?
        if (cached.fileSize !== stats.size) {
          this.prefixedLogger.trace(
            `${zip.getFilePath()}: cache miss, cached file size ${cached.fileSize} !== real size ${stats.size}`,
          );
          return true;
        }
        if (cached.modifiedTimeSec !== stats.mtimeS) {
          this.prefixedLogger.trace(
            `${zip.getFilePath()}: cache miss, cached file mtime ${cached.modifiedTimeSec} !== real mtime ${stats.mtimeS}`,
          );
          return true;
        }

        const cachedResult = cached.value as ValidationResultKey;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (ValidationResult[cachedResult] === undefined) {
          // ValidationResult options have been internally renamed, we have to recalculate
          this.prefixedLogger.trace(
            `${zip.getFilePath()}: cache miss, cached value unrecognized: ${cachedResult}`,
          );
          return true;
        }
        if (ValidationResult[cachedResult] === ValidationResult.INVALID) {
          // INVALID results should be recalculated if the known validation types have changed
          if (cached.version !== currentVersion) {
            this.prefixedLogger.trace(
              `${zip.getFilePath()}: cache miss, cached version ${cached.version} !== current version ${currentVersion}`,
            );
            return true;
          }
          return false;
        }
        return false;
      },
    );

    const cachedResult = cachedValue.value as ValidationResultKey;
    return ValidationResult[cachedResult];
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
    filePath: string,
    fileSubIdentifier: string | undefined,
    valueType: ValueTypeValue,
  ): string {
    return `V${FileCache.VERSION}|${filePath}|${fileSubIdentifier ?? ''}|${valueType}`;
  }
}
