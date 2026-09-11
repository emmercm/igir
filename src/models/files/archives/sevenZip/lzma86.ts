import { SevenZipFormat } from '../../../../../packages/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * An LZMA stream with the x86 BCJ filter applied (.lzma86), as written by
 * 7-Zip's `lzma86` tool. It differs from {@link Lzma} only by a one-byte filter
 * flag ahead of the LZMA properties, so the two are not interchangeable.
 */
export default class Lzma86 extends SevenZipLib {
  /**
   * Construct a new {@link Lzma86} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new Lzma86(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.LZMA86;
  }

  static getExtensions(): string[] {
    return ['.lzma86'];
  }

  getExtension(): string {
    return Lzma86.getExtensions()[0];
  }

  /**
   * Returns false: .lzma86 wraps a single nameless stream, so the entry path is
   * derived from the archive's own filename rather than read from the archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }
}
