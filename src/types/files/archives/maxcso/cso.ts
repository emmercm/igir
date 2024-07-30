import Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Cso extends Maxcso {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Cso(filePath);
  }

  static getExtensions(): string[] {
    return ['.cso'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return Cso.getExtensions()[0];
  }
}
