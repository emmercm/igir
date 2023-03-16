import path from 'path';

import Archive from './archives/archive.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Zip from './archives/zip.js';
import File from './file.js';

export default class FileFactory {
  static async filesFrom(filePath: string): Promise<File[]> {
    if (this.isArchive(filePath)) {
      return this.archiveFrom(filePath).getArchiveEntries();
    }
    return [await File.fileOf(filePath)];
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

    throw new Error(`Unknown archive type: ${path.extname(filePath)}`);
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
