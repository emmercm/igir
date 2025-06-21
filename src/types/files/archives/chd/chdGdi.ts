import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import chdman, { ChdmanBinaryPreference, CHDType } from 'chdman';

import FsPoly from '../../../../polyfill/fsPoly.js';
import { ChecksumBitmask, ChecksumBitmaskValue } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';
import ChdGdiParser from './chdGdiParser.js';

export default class ChdGdi extends Chd {
  protected new(filePath: string): Archive {
    return new ChdGdi(filePath);
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

    return ChdGdiParser.getArchiveEntriesGdRom(this, checksumBitmask);
  }

  async extractArchiveEntries(outputDirectory: string): Promise<string[]> {
    const gdiFile = path.join(outputDirectory, 'track.gdi');
    await chdman.extractCd({
      inputFilename: this.getFilePath(),
      outputFilename: gdiFile,
      binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
    });

    // Apply TOSEC-style CRLF line separators to the .gdi file
    await util.promisify(fs.writeFile)(
      gdiFile,
      (await util.promisify(fs.readFile)(gdiFile)).toString().replaceAll(/\r?\n/g, '\r\n'),
    );

    return await FsPoly.walk(outputDirectory);
  }
}
