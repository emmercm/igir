import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/file.js';
import FileHeader from '../types/fileHeader.js';
import DAT from '../types/logiqx/dat.js';

export default class HeaderProcessor {
  private readonly progressBar: ProgressBar;

  constructor(progressBar: ProgressBar) {
    this.progressBar = progressBar;
  }

  async process(dat: DAT, inputRomFiles: File[]): Promise<File[]> {
    await this.progressBar.logInfo(`${dat.getName()}: Processing file headers`);

    if (!dat.getFileHeader()) {
      return inputRomFiles;
    }

    await this.progressBar.setSymbol(Symbols.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    return async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_HASHER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();
        const fileWithHeader = inputFile.withFileHeader(dat.getFileHeader() as FileHeader);
        await fileWithHeader.resolve();
        callback(null, fileWithHeader);
      },
    );
  }
}
