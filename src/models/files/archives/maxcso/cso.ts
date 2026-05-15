import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

export default class Cso extends Maxcso {
  protected new(filePath: string): Archive {
    return new Cso(filePath);
  }

  static getExtensions(): string[] {
    return ['.cso'];
  }

  getExtension(): string {
    return Cso.getExtensions()[0];
  }
}
