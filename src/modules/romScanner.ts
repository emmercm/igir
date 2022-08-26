import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';

export default class ROMScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async scan(): Promise<ROMFile[]> {
    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(0);

    await this.progressBar.logInfo('Scanning ROM files');
    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(inputFiles.length);
    await this.progressBar.logInfo(`Found ${inputFiles.length} ROM file${inputFiles.length !== 1 ? 's' : ''}`);

    const results = [];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputFiles.length; i += 1) {
      const inputFile = inputFiles[i];

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
    }

    return results;
  }

  private async getRomFilesIn7z(file: string): Promise<ROMFile[]> {
    const romFilesIn7z = await new Promise((resolve) => {
      // TODO(cemmer): this won't let you ctrl-c
      _7z.list(file, (err, result) => {
        if (err) {
          const msg = err.toString()
            .replace(/\n\n+/g, '\n')
            .replace(/^/gm, '   ')
            .trim();
          this.progressBar.logError(`Failed to parse 7z ${file} : ${msg}`);
          resolve([]);
        } else if (!result.length) {
          // WARN(cemmer): this seems to be able to be caused by high concurrency on the loop on
          // the main function, so leave it single-threaded
          this.progressBar.logWarn(`Found no files in 7z: ${file}`);
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
      const romFiles = zip.getEntries()
        .map((entry) => new ROMFile(
          file,
          entry.entryName,
          entry.header.crc.toString(16),
        ));
      if (!romFiles.length) {
        this.progressBar.logWarn(`Found no files in zip: ${file}`);
      }
      return romFiles;
    } catch (e) {
      this.progressBar.logError(`Failed to parse zip ${file} : ${e}`);
      return [];
    }
  }
}
