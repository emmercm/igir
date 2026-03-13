import SevenZipLib from './sevenZipLib.js';

export default class ZipSpanned extends SevenZipLib {
  protected new(filePath: string): SevenZipLib {
    return new ZipSpanned(filePath);
  }

  static getExtensions(): string[] {
    return ['.zip.001', '.z01'];
  }

  getExtension(): string {
    return ZipSpanned.getExtensions()[0];
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
  }

  canContainMultipleEntries(): boolean {
    return true;
  }
}
