import path from 'node:path';

import chdman, { CHDType } from '../../../../../packages/chdman/index.js';
import FsUtil, { WalkMode } from '../../../../utils/fsUtil.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import type ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';
import ChdBinCueParser from './chdBinCueParser.js';

/**
 * A CHD that represents a CD-ROM or GD-ROM, exposed as its constituent .cue and .bin tracks.
 */
export default class ChdBinCue extends Chd {
  /**
   * Construct a new {@link ChdBinCue} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new ChdBinCue(filePath);
  }

  /**
   * Returns true: bin/cue CHDs support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    if (checksumBitmask === ChecksumBitmask.NONE) {
      // Doing a quick scan
      return [];
    }

    const info = await this.getInfo();
    if (info.type !== CHDType.CD_ROM && info.type !== CHDType.GD_ROM) {
      // Not valid
      return [];
    }

    return await ChdBinCueParser.getArchiveEntriesBinCue(this, checksumBitmask);
  }

  /**
   * Extract the CHD's CD content into the given directory as a .cue file with split .bin tracks,
   * returning the paths of the produced files.
   */
  async extractArchiveEntries(outputDirectory: string): Promise<string[]> {
    const outputPrefix = path.parse(this.getFilePath()).name;
    const cueFile = path.join(outputDirectory, `${outputPrefix}.cue`);
    const binFilePattern = path.join(outputDirectory, `${outputPrefix} (Track %t).bin`);
    await chdman.extractCd({
      inputFilename: this.getFilePath(),
      outputFilename: cueFile,
      outputBinFilename: binFilePattern,
      splitBin: true,
    });

    return [
      cueFile,
      ...(await FsUtil.walk(outputDirectory, WalkMode.FILES)).filter((filePath) =>
        / \(Track [0-9]+\)\.bin$/.test(filePath),
      ),
    ];
  }
}
