import path from 'node:path';

import SevenZipLib from './sevenZipLib.js';

export default class ZipX extends SevenZipLib {
  protected new(filePath: string): SevenZipLib {
    return new ZipX(filePath);
  }

  static getExtensions(): string[] {
    return ['.zipx', '.zx01'];
  }

  getExtension(): string {
    for (const ext of ZipX.getExtensions()) {
      if (this.getFilePath().toLowerCase().endsWith(ext)) {
        return ext;
      }
    }
    return path.parse(this.getFilePath()).ext;
  }

  hasMeaningfulEntryPaths(): boolean {
    return true;
  }

  canContainMultipleEntries(): boolean {
    return true;
  }
}
