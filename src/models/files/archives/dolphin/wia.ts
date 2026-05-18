import type Archive from '../archive.js';
import Dolphin from './dolphin.js';

/**
 * Wii ISO Archive (WIA) compressed disc image.
 */
export default class Wia extends Dolphin {
  /**
   * Construct a new {@link Wia} archive for the given file path.
   */
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
