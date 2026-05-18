import type Archive from '../archive.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A 7-Zip (.7z) archive.
 */
export default class SevenZip extends SevenZipLib {
  /**
   * Construct a new {@link SevenZip} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new SevenZip(filePath);
  }

  static getExtensions(): string[] {
    return ['.7z'];
  }

  getExtension(): string {
    return SevenZip.getExtensions()[0];
  }

  /**
   * Returns true: 7-Zip archives support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns true: 7-Zip archives store entry paths.
   */
  hasMeaningfulEntryPaths(): boolean {
    return true;
  }
}
