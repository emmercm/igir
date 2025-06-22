import path from 'node:path';

import chdman, { ChdmanBinaryPreference, CHDType } from 'chdman';

import FsPoly, { WalkMode } from '../../../../polyfill/fsPoly.js';
import { ChecksumBitmask, ChecksumBitmaskValue } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';
import ChdBinCueParser from './chdBinCueParser.js';

export default class ChdBinCue extends Chd {
  protected new(filePath: string): Archive {
    return new ChdBinCue(filePath);
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

  async extractArchiveEntries(outputDirectory: string): Promise<string[]> {
    const outputPrefix = path.parse(this.getFilePath()).name;
    const cueFile = path.join(outputDirectory, `${outputPrefix}.cue`);
    const binFilePattern = path.join(outputDirectory, `${outputPrefix} (Track %t).bin`);
    await chdman.extractCd({
      inputFilename: this.getFilePath(),
      outputFilename: cueFile,
      outputBinFilename: binFilePattern,
      splitBin: true,
      binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
    });

    return [
      cueFile,
      ...(await FsPoly.walk(outputDirectory, WalkMode.FILES)).filter((filePath) =>
        / \(Track [0-9]+\)\.bin$/.test(filePath),
      ),
    ];
  }
}
