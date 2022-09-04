import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import async, { AsyncResultCallback } from 'async';
import { Mutex } from 'async-mutex';
import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/file.js';
import Options from '../types/options.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ROMScanner {
  private static readonly SEVENZIP_MUTEX = new Mutex();

  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  // TODO(cemmer): support for headered ROM files (e.g. NES)
  async scan(): Promise<File[]> {
    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(0);

    await this.progressBar.logInfo('Scanning ROM files');
    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(inputFiles.length);
    await this.progressBar.logInfo(`Found ${inputFiles.length} ROM file${inputFiles.length !== 1 ? 's' : ''}`);

    return (await async.mapLimit(
      inputFiles,
      Constants.ROM_SCANNER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.increment();

        let files: File[];
        if (Constants.ZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
          files = await this.getFilesInZip(inputFile);
        } else if (Constants.SEVENZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
          files = await this.getFilesIn7z(inputFile);
        } else {
          files = [await new File(inputFile).resolve()];
        }

        callback(null, files);
      },
    )).flatMap((files) => files);
  }

  private async getFilesIn7z(filePath: string): Promise<File[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     * it will return no files but also no error. Try to prevent that behavior.
     */
    return ROMScanner.SEVENZIP_MUTEX.runExclusive(async () => {
      const filesIn7z = await new Promise((resolve) => {
        // TODO(cemmer): this won't let you ctrl-c
        _7z.list(filePath, (err, result) => {
          if (err) {
            const msg = err.toString()
              .replace(/\n\n+/g, '\n')
              .replace(/^/gm, '   ')
              .trim();
            this.progressBar.logError(`Failed to parse 7z ${filePath} : ${msg}`);
            resolve([]);
          } else if (!result.length) {
            this.progressBar.logWarn(`Found no files in 7z: ${filePath}`);
            resolve([]);
          } else {
            resolve(result);
          }
        });
      }) as Result[];
      return filesIn7z.map((result) => new File(filePath, result.name, result.crc));
    });
  }

  private async getFilesInZip(filePath: string): Promise<File[]> {
    try {
      const zip = new AdmZip(filePath);
      const files = zip.getEntries()
        .map((entry) => new File(
          filePath,
          entry.entryName,
          entry.header.crc.toString(16),
        ));
      if (!files.length) {
        await this.progressBar.logWarn(`Found no files in zip: ${filePath}`);
      }
      return files;
    } catch (e) {
      await this.progressBar.logError(`Failed to parse zip ${filePath} : ${e}`);
      return [];
    }
  }
}
