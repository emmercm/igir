import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import path from 'path';

import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ROMFile from '../types/romFile.js';

export default class ROMScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async scan(): Promise<ROMFile[]> {
    const results: ROMFile[] = [];

    this.progressBar.reset(this.options.getInputFilesWithoutExclusions().length).setSymbol('🔎');

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < this.options.getInputFilesWithoutExclusions().length; i += 1) {
      const file = this.options.getInputFilesWithoutExclusions()[i];

      this.progressBar.increment();

      let romFiles: ROMFile[] = [];
      if (path.extname(file) === '.7z') {
        romFiles = await ROMScanner.getRomFilesIn7z(file);
      } else if (path.extname(file) === '.zip') {
        romFiles = ROMScanner.getRomFilesInZip(file);
      } else {
        romFiles = [new ROMFile(file)];
      }

      results.push(...romFiles);
    }
    // TODO(cemmer): de-duplicate?

    return results.flatMap((romFiles) => romFiles);
  }

  private static async getRomFilesIn7z(file: string): Promise<ROMFile[]> {
    const romFilesIn7z = await new Promise((resolve, reject) => {
      _7z.list(file, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    }) as Result[];
    return romFilesIn7z.map((result) => new ROMFile(file, result.name, result.crc));
  }

  private static getRomFilesInZip(file: string): ROMFile[] {
    const zip = new AdmZip(file);
    return zip.getEntries()
      .map((entry) => new ROMFile(
        file,
        entry.entryName,
        entry.header.crc.toString(16),
      ));
  }
}
