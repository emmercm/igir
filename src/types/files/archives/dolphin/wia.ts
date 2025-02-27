import Archive from '../archive.js';
import Dolphin from './dolphin.js';

export default class Wia extends Dolphin {
  protected new(filePath: string): Archive {
    return new Wia(filePath);
  }

  static getExtensions(): string[] {
    return ['.wia'];
  }

  getExtension(): string {
    return Wia.getExtensions()[0];
  }
}
