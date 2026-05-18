import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

/**
 * Compressed ISO (CSO) disc image, produced by maxcso.
 */
export default class Cso extends Maxcso {
  /**
   * Construct a new {@link Cso} archive for the given file path.
   */
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
