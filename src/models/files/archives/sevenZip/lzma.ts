import { SevenZipFormat } from '../../../../../packages/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A raw LZMA (.lzma) compressed file, the alone-format container `lzma_alone`
 * writes -- not the LZMA2 streams inside a .7z.
 */
export default class Lzma extends SevenZipLib {
  /**
   * Construct a new {@link Lzma} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new Lzma(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.LZMA;
  }

  static getExtensions(): string[] {
    return ['.lzma'];
  }

  getExtension(): string {
    return Lzma.getExtensions()[0];
  }

  /**
   * Returns false: .lzma wraps a single nameless stream, so the entry path is
   * derived from the archive's own filename rather than read from the archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }
}
