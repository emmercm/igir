import SevenZip from './sevenZip.js';

export default class Gzip extends SevenZip {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): SevenZip {
    return new Gzip(filePath);
  }

  static getExtensions(): string[] {
    return ['.gz', '.gzip'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return Gzip.getExtensions()[0];
  }

  static getFileSignatures(): Buffer[] {
    return [
      Buffer.from('1F8B08', 'hex'), // deflate
    ];
  }
}
