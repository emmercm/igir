import path from 'node:path';

import Archive from './archives/archive.js';
import ArchiveEntry from './archives/archiveEntry.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Zip from './archives/zip.js';
import File from './file.js';
import FileCache from './fileCache.js';
import { ChecksumBitmask } from './fileChecksums.js';

export default class FileFactory {
  static async filesFrom(
    filePath: string,
    checksumBitmask: number = ChecksumBitmask.CRC32,
  ): Promise<File[]> {
    if (!this.isArchive(filePath)) {
      return [await FileCache.getOrComputeFile(filePath, checksumBitmask)];
    }

    try {
      return await this.entriesFrom(filePath, checksumBitmask);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`file doesn't exist: ${filePath}`);
      }
      if (typeof error === 'string') {
        throw new Error(error);
      }
      throw error;
    }
  }

  /**
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  private static async entriesFrom(
    filePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Archive>[]> {
    let archive: Archive;
    if (Zip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Zip(filePath);
    } else if (Tar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Tar(filePath);
    } else if (Rar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Rar(filePath);
    } else if (SevenZip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new SevenZip(filePath);
    } else {
      throw new Error(`unknown archive type: ${path.extname(filePath)}`);
    }

    return FileCache.getOrComputeEntries(archive, checksumBitmask);
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
