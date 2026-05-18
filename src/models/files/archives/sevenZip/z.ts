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

  static getExtensions(): string[] {
    return ['.z'];
  }

  getExtension(): string {
    return Z.getExtensions()[0];
  }

  /**
   * Returns true: .Z archives store entry paths.
   */
  hasMeaningfulEntryPaths(): boolean {
    return true;
  }
}
