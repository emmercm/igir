import _7z, { Result } from '7zip-min';
import AdmZip from 'adm-zip';
import async, { AsyncResultCallback } from 'async';
import { Mutex } from 'async-mutex';
import unrar from 'node-unrar-js';
import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import Options from '../types/options.js';
import ROMFile from '../types/romFile.js';

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
  async scan(): Promise<ROMFile[]> {
    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(0);

    await this.progressBar.logInfo('Scanning ROM files');
    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(inputFiles.length);
    await this.progressBar.logInfo(`Found ${inputFiles.length} ROM file${inputFiles.length !== 1 ? 's' : ''}`);

    return (await async.mapLimit(
      inputFiles,
      Constants.ROM_SCANNER_THREADS,
      async (inputFile, callback: AsyncResultCallback<ROMFile[], Error>) => {
        await this.progressBar.increment();

        let romFiles: ROMFile[];
        if (Constants.ZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
          romFiles = await this.getRomFilesInZip(inputFile);
        } else if (Constants.RAR_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
          romFiles = await this.getRomFilesInRar(inputFile);
        } else if (Constants.SEVENZIP_EXTENSIONS.indexOf(path.extname(inputFile)) !== -1) {
          romFiles = await this.getRomFilesIn7z(inputFile);
        } else {
          romFiles = [await new ROMFile(inputFile).resolve()];
        }

        callback(null, romFiles);
      },
    )).flatMap((romFiles) => romFiles);
  }

  private async getRomFilesIn7z(file: string): Promise<ROMFile[]> {
    /**
     * WARN(cemmer): {@link _7z.list} seems to have issues with any amount of real concurrency,
     * it will return no files but also no error. Try to prevent that behavior.
     */
    return ROMScanner.SEVENZIP_MUTEX.runExclusive(async () => {
      const romFilesIn7z = await new Promise((resolve) => {
        // TODO(cemmer): this won't let you ctrl-c
        _7z.list(file, (err, result) => {
          if (err) {
            const msg = err.toString()
              .replace(/\n\n+/g, '\n')
              .replace(/^/gm, '   ')
              .trim();
            this.progressBar.logError(`Failed to parse archive ${file} : ${msg}`);
            resolve([]);
          } else if (!result.length) {
            this.progressBar.logWarn(`Found no files in archive: ${file}`);
            resolve([]);
          } else {
            resolve(result);
          }
        });
      }) as Result[];
      return romFilesIn7z.map((result) => new ROMFile(file, result.name, result.crc));
    });
  }

  private async getRomFilesInRar(file: string): Promise<ROMFile[]> {
    try {
      const rar = await unrar.createExtractorFromFile({
        filepath: file,
      });
      const rarFiles = [...rar.getFileList().fileHeaders]
        .map((fileHeader) => new ROMFile(file, fileHeader.name, fileHeader.crc.toString(16)));
      if (!rarFiles.length) {
        await this.progressBar.logWarn(`Found no files in rar: ${rar}`);
      }
      return rarFiles;
    } catch (e) {
      await this.progressBar.logError(`Failed to parse rar ${file} : ${e}`);
      return [];
    }
  }

  private async getRomFilesInZip(file: string): Promise<ROMFile[]> {
    try {
      const zip = new AdmZip(file);
      const romFiles = zip.getEntries()
        .map((entry) => new ROMFile(
          file,
          entry.entryName,
          entry.header.crc.toString(16),
        ));
      if (!romFiles.length) {
        await this.progressBar.logWarn(`Found no files in zip: ${file}`);
      }
      return romFiles;
    } catch (e) {
      await this.progressBar.logError(`Failed to parse zip ${file} : ${e}`);
      return [];
    }
  }
}
