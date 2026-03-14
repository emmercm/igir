import SevenZipLib from './sevenZipLib.js';

export default class Z extends SevenZipLib {
  protected new(filePath: string): SevenZipLib {
    return new Z(filePath);
  }

  static getExtensions(): string[] {
    return ['.z'];
  }

  getExtension(): string {
    return Z.getExtensions()[0];
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
  }
}
