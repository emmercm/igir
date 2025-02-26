import Archive from '../archive.js';
import Dolphin from './dolphin.js';

export default class Gcz extends Dolphin {
  protected new(filePath: string): Archive {
    return new Gcz(filePath);
  }

  static getExtensions(): string[] {
    return ['.gcz'];
  }

  getExtension(): string {
    return Gcz.getExtensions()[0];
  }
}
