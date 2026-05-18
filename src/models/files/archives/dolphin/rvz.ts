import type Archive from '../archive.js';
import Dolphin from './dolphin.js';

/**
 * Dolphin's RVZ compressed Wii/GameCube disc image.
 */
export default class Rvz extends Dolphin {
  /**
   * Construct a new {@link Rvz} archive for the given file path.
   */
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
