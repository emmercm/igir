import type Archive from '../archive.js';
import Maxcso from './maxcso.js';

/**
 * ZSO (LZ4-compressed ISO) disc image format, handled by maxcso.
 */
export default class Zso extends Maxcso {
  /**
   * Construct a new {@link Zso} archive for the given file path.
   */
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
