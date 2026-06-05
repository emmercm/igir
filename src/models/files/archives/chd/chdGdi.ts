import fs from 'node:fs';
import path from 'node:path';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import FsUtil, { WalkMode } from '../../../../utils/fsUtil.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import type ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';
import ChdGdiParser from './chdGdiParser.js';

/**
 * A CHD that represents a GD-ROM, exposed as its constituent .gdi and track files.
 */
export default class ChdGdi extends Chd {
  /**
   * Construct a new {@link ChdGdi} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new ChdGdi(filePath);
  }

  /**
   * Returns true: GD-ROM CHDs support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    if (checksumBitmask === ChecksumBitmask.NONE) {
      // Doing a quick scan
      return [];
    }

    if ((await this.getInfo()).type !== CHDType.GD_ROM) {
      // Not valid
      return [];
    }

    return await ChdGdiParser.getArchiveEntriesGdRom(this, checksumBitmask);
  }

  /**
   * Extract the CHD's GD-ROM content into the given directory as a .gdi file with track files,
   * returning the paths of the produced files.
   */
  async extractArchiveEntries(outputDirectory: string): Promise<string[]> {
    const gdiFile = path.join(outputDirectory, 'track.gdi');
    await chdman.extractCd({
      inputFilename: this.getFilePath(),
      outputFilename: gdiFile,
    });

    // Apply TOSEC-style CRLF line separators to the .gdi file
    await FsUtil.writeFile(
      gdiFile,
      (await fs.promises.readFile(gdiFile)).toString().replaceAll(/\r?\n/g, '\r\n'),
    );

    await FsUtil.mv(
      gdiFile,
      path.join(outputDirectory, `${path.parse(this.getFilePath()).name}.gdi`),
    );

    return await FsUtil.walk(outputDirectory, WalkMode.FILES);
  }
}
