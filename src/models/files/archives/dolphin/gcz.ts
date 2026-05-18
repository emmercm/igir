import type Archive from '../archive.js';
import Dolphin from './dolphin.js';

/**
 * GameCube Compressed (GCZ) disc image.
 */
export default class Gcz extends Dolphin {
  /**
   * Construct a new {@link Gcz} archive for the given file path.
   */
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
