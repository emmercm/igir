import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import async from 'async';
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

    this.progressBar.reset(0).setSymbol('🔎');

    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    this.progressBar.reset(inputFiles.length);

    await async.eachLimit(inputFiles, 5, async (inputFile, callback) => {
      this.progressBar.increment();

      let romFiles: ROMFile[] = [];
      if (path.extname(inputFile) === '.7z') {
        romFiles = await ROMScanner.getRomFilesIn7z(inputFile);
      } else if (path.extname(inputFile) === '.zip') {
        romFiles = ROMScanner.getRomFilesInZip(inputFile);
      } else {
        romFiles = [new ROMFile(inputFile)];
      }

      results.push(...romFiles);
      callback();
    });

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
    try {
      const zip = new AdmZip(file);
      return zip.getEntries()
        .map((entry) => new ROMFile(
          file,
          entry.entryName,
          entry.header.crc.toString(16),
        ));
    } catch (e) {
      ProgressBar.logError(`Failed to parse zip ${file} : ${e}`);
      return [];
    }
  }
}
