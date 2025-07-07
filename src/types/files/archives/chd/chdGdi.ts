import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import chdman, { ChdmanBinaryPreference, CHDType } from 'chdman';

import FsPoly, { WalkMode } from '../../../../polyfill/fsPoly.js';
import type { ChecksumBitmaskValue } from '../../fileChecksums.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import type Archive from '../archive.js';
import type ArchiveEntry from '../archiveEntry.js';
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
    await FsPoly.writeFile(
      gdiFile,
      (await util.promisify(fs.readFile)(gdiFile)).toString().replaceAll(/\r?\n/g, '\r\n'),
    );

    await FsPoly.mv(
      gdiFile,
      path.join(outputDirectory, `${path.parse(this.getFilePath()).name}.gdi`),
    );

    return await FsPoly.walk(outputDirectory, WalkMode.FILES);
  }
}
