import path from 'node:path';

import SevenZip from './sevenZip.js';

export default class ZipX extends SevenZip {
  protected new(filePath: string): SevenZip {
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
}
