import { SevenZipFormat } from '../../../../../packages/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A bzip2 (.bz2) compressed file.
 */
export default class Bzip2 extends SevenZipLib {
  /**
   * Construct a new {@link Bzip2} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new Bzip2(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.BZIP2;
  }

  static getExtensions(): string[] {
    return ['.bz2', '.bzip2'];
  }

  getExtension(): string {
    return Bzip2.getExtensions()[0];
  }

  /**
   * Returns false: bzip2 wraps a single nameless stream, so the entry path is
   * derived from the archive's own filename rather than read from the archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }
}
