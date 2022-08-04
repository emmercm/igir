import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import async from 'async';
import path from 'path';

import Constants from '../constants.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';
import ProgressBar from './progressBar/progressBar.js';

export default class ROMScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async scan(): Promise<ROMFile[]> {
    const results: ROMFile[] = [];

    await this.progressBar.setSymbol('🔎');
    await this.progressBar.reset(0);

    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(inputFiles.length);

    await async.eachLimit(inputFiles, 5, async (inputFile, callback) => {
      await this.progressBar.increment();

      let romFiles: ROMFile[];
      if (Constants.ZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
        romFiles = this.getRomFilesInZip(inputFile);
      } else if (Constants.SEVENZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
        romFiles = await this.getRomFilesIn7z(inputFile);
      } else {
        romFiles = [new ROMFile(inputFile)];
      }

      results.push(...romFiles);
      callback();
    });

    return results.flatMap((romFiles) => romFiles);
  }

  private async getRomFilesIn7z(file: string): Promise<ROMFile[]> {
    const romFilesIn7z = await new Promise((resolve) => {
      // TODO(cemmer): this won't let you ctrl-c
      _7z.list(file, (err, result) => {
        if (err) {
          this.progressBar.logError(`Failed to parse 7z ${file} : ${err}`);
          resolve([]);
        } else {
          resolve(result);
        }
      });
    }) as Result[];
    return romFilesIn7z.map((result) => new ROMFile(file, result.name, result.crc));
  }

  private getRomFilesInZip(file: string): ROMFile[] {
    try {
      const zip = new AdmZip(file);
      return zip.getEntries()
        .map((entry) => new ROMFile(
          file,
          entry.entryName,
          entry.header.crc.toString(16),
        ));
    } catch (e) {
      this.progressBar.logError(`Failed to parse zip ${file} : ${e}`);
      return [];
    }
  }
}
