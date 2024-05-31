import SevenZip from './sevenZip.js';

export default class ZipSpanned extends SevenZip {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): SevenZip {
    return new ZipSpanned(filePath);
  }

  static getExtensions(): string[] {
    return ['.zip.001', '.z01'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return ZipSpanned.getExtensions()[0];
  }

  static getFileSignatures(): Buffer[] {
    return [Buffer.from('504B0708', 'hex')];
  }
}
