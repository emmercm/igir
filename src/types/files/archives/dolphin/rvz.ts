import Archive from '../archive.js';
import Dolphin from './dolphin.js';

export default class Rvz extends Dolphin {
  protected new(filePath: string): Archive {
    return new Rvz(filePath);
  }

  static getExtensions(): string[] {
    return ['.rvz'];
  }

  getExtension(): string {
    return Rvz.getExtensions()[0];
  }
}
