import type Archive from '../archive.js';
import SevenZipLib from './sevenZipLib.js';

export default class SevenZip extends SevenZipLib {
  protected new(filePath: string): Archive {
    return new SevenZip(filePath);
  }

  static getExtensions(): string[] {
    return ['.7z'];
  }

  getExtension(): string {
    return SevenZip.getExtensions()[0];
  }

  canExtract(): boolean {
    return true;
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
  }
}
