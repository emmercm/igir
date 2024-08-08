import Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Zso extends Maxcso {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Zso(filePath);
  }

  static getExtensions(): string[] {
    return ['.zso'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return Zso.getExtensions()[0];
  }
}
