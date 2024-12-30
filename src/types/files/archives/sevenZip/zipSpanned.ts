import SevenZip from './sevenZip.js';

export default class ZipSpanned extends SevenZip {
  protected new(filePath: string): SevenZip {
    return new ZipSpanned(filePath);
  }

  static getExtensions(): string[] {
    return ['.zip.001', '.z01'];
  }

  getExtension(): string {
    return ZipSpanned.getExtensions()[0];
  }
}
