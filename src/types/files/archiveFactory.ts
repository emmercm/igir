import path from 'path';

import Archive from './archive.js';
import Rar from './rar.js';
import SevenZip from './sevenZip.js';
import Zip from './zip.js';

export default class ArchiveFactory {
  static archiveFrom(filePath: string): Archive {
    const extension = path.extname(filePath).toLowerCase();

    if (Zip.SUPPORTED_EXTENSIONS.indexOf(extension) !== -1) {
      return new Zip(filePath);
    } if (Rar.SUPPORTED_EXTENSIONS.indexOf(extension) !== -1) {
      return new Rar(filePath);
    } if (SevenZip.SUPPORTED_EXTENSIONS.indexOf(extension) !== -1) {
      return new SevenZip(filePath);
    }

    throw new Error(`Unknown archive type: ${filePath}`);
  }

  static isArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_EXTENSIONS,
      ...Rar.SUPPORTED_EXTENSIONS,
      ...SevenZip.SUPPORTED_EXTENSIONS,
    ].indexOf(path.extname(filePath)) !== -1;
  }
}
