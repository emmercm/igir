import Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Dax extends Maxcso {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Dax(filePath);
  }

  static getExtensions(): string[] {
    return ['.dax'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return Dax.getExtensions()[0];
  }
}
