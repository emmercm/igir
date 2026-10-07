import { SevenZipFormat } from '../../../../../addons/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A spanned (multi-volume) ZIP archive.
 */
export default class ZipSpanned extends SevenZipLib {
  /**
   * Construct a new {@link ZipSpanned} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new ZipSpanned(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.ZIP;
  }

  static getExtensions(): string[] {
    return ['.zip.001', '.z01'];
  }

  getExtensions(): string[] {
    return ZipSpanned.getExtensions();
  }

  /**
   * Returns true: spanned ZIP archives store entry paths.
   */
  hasMeaningfulEntryPaths(): boolean {
    return true;
  }
}
