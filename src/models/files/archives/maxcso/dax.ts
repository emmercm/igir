import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

/**
 * DAX PSP disc image format, handled by maxcso.
 */
export default class Dax extends Maxcso {
  /**
   * Construct a new {@link Dax} archive for the given file path.
   */
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
