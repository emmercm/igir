import SevenZip from './sevenZip.js';

export default class Z extends SevenZip {
  protected new(filePath: string): SevenZip {
    return new Z(filePath);
  }

  static getExtensions(): string[] {
    return ['.z'];
  }

  getExtension(): string {
    return Z.getExtensions()[0];
  }
}
