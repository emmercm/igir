import Archive from './archive.js';
import Rar from './rar.js';
import SevenZip from './sevenZip.js';
import Tar from './tar.js';
import Zip from './zip.js';

export default class ArchiveFactory {
  static archiveFrom(filePath: string): Archive {
    if (Zip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Zip(filePath);
    } if (Tar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Tar(filePath);
    } if (Rar.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new Rar(filePath);
    } if (SevenZip.SUPPORTED_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))) {
      return new SevenZip(filePath);
    }

    throw new Error(`Unknown archive type: ${filePath}`);
  }

  static isArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_EXTENSIONS,
      ...Tar.SUPPORTED_EXTENSIONS,
      ...Rar.SUPPORTED_EXTENSIONS,
      ...SevenZip.SUPPORTED_EXTENSIONS,
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }
}
