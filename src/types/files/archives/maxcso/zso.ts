import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Zso extends Maxcso {
  protected new(filePath: string): Archive {
    return new Zso(filePath);
  }

  static getExtensions(): string[] {
    return ['.zso'];
  }

  getExtension(): string {
    return Zso.getExtensions()[0];
  }
}
