import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Dax extends Maxcso {
  protected new(filePath: string): Archive {
    return new Dax(filePath);
  }

  static getExtensions(): string[] {
    return ['.dax'];
  }

  getExtension(): string {
    return Dax.getExtensions()[0];
  }
}
