import { SevenZipFormat } from '../../../../../packages/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A Unix compress (.Z) archive.
 */
export default class Z extends SevenZipLib {
  /**
   * Construct a new {@link Z} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new Z(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.Z;
  }

  static getExtensions(): string[] {
    return ['.z'];
  }

  getExtension(): string {
    return Z.getExtensions()[0];
  }

  /**
   * Returns false: .Z wraps a single nameless stream, so the entry path is
   * derived from the archive's own filename rather than read from the archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }
}
