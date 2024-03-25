import path from 'node:path';

import Archive from './archives/archive.js';
import Chd from './archives/chd/chd.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Zip from './archives/zip.js';
import File from './file.js';
import { ChecksumBitmask } from './fileChecksums.js';

export default class FileFactory {
  static async filesFrom(
    filePath: string,
    checksumBitmask: number = ChecksumBitmask.CRC32,
  ): Promise<File[]> {
    if (!this.isArchive(filePath)) {
      return [await File.fileOf({ filePath }, checksumBitmask)];
    }

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
  }

  /**
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  public static archiveFrom(filePath: string): Archive {
    if (Zip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Zip(filePath);
    } if (Tar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Tar(filePath);
    } if (Rar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Rar(filePath);
    } if (SevenZip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new SevenZip(filePath);
    } if (Chd.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Chd(filePath);
    }

    throw new Error(`unknown archive type: ${path.extname(filePath)}`);
  }

  static isArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_EXTENSIONS,
      ...Tar.SUPPORTED_EXTENSIONS,
      ...Rar.SUPPORTED_EXTENSIONS,
      ...SevenZip.SUPPORTED_EXTENSIONS,
      ...Chd.SUPPORTED_EXTENSIONS,
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }
}
