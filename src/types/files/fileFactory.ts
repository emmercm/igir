import { Stats } from 'node:fs';
import path from 'node:path';

import FsPoly from '../../polyfill/fsPoly.js';
import Cache from '../cache.js';
import Archive from './archives/archive.js';
import ArchiveEntry, { ArchiveEntryProps } from './archives/archiveEntry.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Zip from './archives/zip.js';
import File, { FileProps } from './file.js';
import { ChecksumBitmask } from './fileChecksums.js';

interface CacheValue {
  fileSize: number,
  modifiedTimeMillis: number,
  files: FileProps[] | ArchiveEntryProps<Archive>[],
}

const CACHE = new Cache<CacheValue>({
  filePath: 'igir.cache',
  saveToFileInterval: 30_000,
}).load();

export default class FileFactory {
  private static readonly CACHE = CACHE;

  static async filesFrom(
    filePath: string,
    checksumBitmask: number = ChecksumBitmask.CRC32,
  ): Promise<File[]> {
    return this.getOrCompute(filePath, checksumBitmask, async () => {
      // Raw file
      if (!this.isArchive(filePath)) {
        return [await File.fileOf({ filePath }, checksumBitmask)];
      }

      // Archive
      try {
        return await this.archiveFrom(filePath).getArchiveEntries(checksumBitmask);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          throw new Error(`file doesn't exist: ${filePath}`);
        }
        if (typeof error === 'string') {
          throw new Error(error);
        }
        throw error;
      }
    });
  }

  private static async getOrCompute(
    filePath: string,
    checksumBitmask: number,
    runnable: () => Promise<File[]>,
  ): Promise<File[]> {
    let stat: Stats;
    try {
      stat = await FsPoly.stat(filePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist
        return [];
      }
      throw error;
    }
    const cacheKey = String(stat.ino);

    const existing = await (await this.CACHE).get(cacheKey);
    const existingBitmask = (existing?.files.every((file) => file.crc32 !== undefined && file.crc32 !== '00000000') ? ChecksumBitmask.CRC32 : 0)
      | (existing?.files.every((file) => file.md5) ? ChecksumBitmask.MD5 : 0)
      | (existing?.files.every((file) => file.sha1) ? ChecksumBitmask.SHA1 : 0);
    const remainingBitmask = checksumBitmask ^ existingBitmask;
    // If the file appears untouched and the cache contains all checksums we need, then cache "hit"
    if (existing?.fileSize === stat.size
      && existing?.modifiedTimeMillis === stat.mtimeMs
      && !remainingBitmask
    ) {
      // Raw file
      if (!this.isArchive(filePath)) {
        return Promise.all(existing.files.map(async (props) => File.fileOfObject(
          filePath,
          {
            ...props,
            // Only return the checksums requested
            crc32: checksumBitmask & ChecksumBitmask.CRC32 ? props.crc32 : undefined,
            md5: checksumBitmask & ChecksumBitmask.MD5 ? props.md5 : undefined,
            sha1: checksumBitmask & ChecksumBitmask.SHA1 ? props.sha1 : undefined,
          } as FileProps,
        )));
      }

      // Archive
      const archive = this.archiveFrom(filePath);
      return Promise.all(existing.files.map(async (props) => ArchiveEntry.entryOfObject(
        archive,
        {
          ...props,
          // Only return the checksums requested
          crc32: checksumBitmask & ChecksumBitmask.CRC32 ? props.crc32 : undefined,
          md5: checksumBitmask & ChecksumBitmask.MD5 ? props.md5 : undefined,
          sha1: checksumBitmask & ChecksumBitmask.SHA1 ? props.sha1 : undefined,
        } as ArchiveEntryProps<typeof archive>,
      )));
    }

    // Cache "miss", process the files
    const files = await runnable();
    await (await this.CACHE).set(cacheKey, {
      fileSize: stat.size,
      modifiedTimeMillis: stat.mtimeMs,
      files: files.map((file) => file.toObject() as FileProps), // TODO
    });
    return files;
  }

  /**
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  private static archiveFrom(filePath: string): Archive {
    if (Zip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Zip(filePath);
    } if (Tar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Tar(filePath);
    } if (Rar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Rar(filePath);
    } if (SevenZip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new SevenZip(filePath);
    }

    throw new Error(`unknown archive type: ${path.extname(filePath)}`);
  }

  static isArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_EXTENSIONS,
      ...Tar.SUPPORTED_EXTENSIONS,
      ...Rar.SUPPORTED_EXTENSIONS,
      ...SevenZip.SUPPORTED_EXTENSIONS,
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }
}
