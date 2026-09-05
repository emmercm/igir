import { SevenZipFormat } from '../../../../../packages/7zip/index.js';
import SevenZipLib from './sevenZipLib.js';

/**
 * A byte-sliced file, split across `.001`, `.002`, and so on. Only the first
 * slice is ever named: 7-Zip derives the rest from its filename.
 *
 * This holds exactly one entry, the slices joined back together, named after the
 * slices with the number removed -- `game.bin.001` yields `game.bin`. When the
 * joined bytes are themselves an archive, that entry is the archive file, not
 * its contents: Igir does not read archives nested inside archives.
 */
export default class Split extends SevenZipLib {
  /**
   * Construct a new {@link Split} archive for the given file path.
   */
  protected new(filePath: string): SevenZipLib {
    return new Split(filePath);
  }

  /**
   * Returns the 7-Zip handler that reads this format.
   */
  protected getSevenZipFormat(): SevenZipFormat {
    return SevenZipFormat.SPLIT;
  }

  static getExtensions(): string[] {
    return ['.001'];
  }

  getExtension(): string {
    return Split.getExtensions()[0];
  }

  /**
   * Returns false: the single entry is named after the slices' filenames, not
   * by anything recorded inside them.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }
}
