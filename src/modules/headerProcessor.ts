import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
import FileHeader from '../types/files/fileHeader.js';
import DAT from '../types/logiqx/dat.js';
import Options from '../types/options.js';

export default class HeaderProcessor {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async process(dat: DAT, inputRomFiles: File[]): Promise<File[]> {
    await this.progressBar.logInfo(`${dat.getName()}: Processing file headers`);

    await this.progressBar.setSymbol(Symbols.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    const headerNameForDat = dat.getFileHeaderName();
    let headerForDat: FileHeader | undefined;
    if (headerNameForDat) {
      headerForDat = FileHeader.getForName(headerNameForDat);
      if (!headerForDat) {
        await this.progressBar.logWarn(`DAT has unknown ROM header name: ${headerNameForDat}`);
      }
    }

    return async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_HASHER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();

        // Can get FileHeader from DAT, use that
        if (headerForDat) {
          const fileWithHeader = await inputFile.withFileHeader(headerForDat).resolve();
          return callback(null, fileWithHeader);
        }

        // Can get FileHeader from extension, use that
        const headerForExtension = FileHeader.getForFilename(inputFile.getExtractedFilePath());
        if (headerForExtension) {
          const fileWithHeader = await inputFile.withFileHeader(headerForExtension).resolve();
          return callback(null, fileWithHeader);
        }

        // Should get FileHeader from File, try to
        if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
          const headerForFile = await inputFile
            .extract(async (localFile) => FileHeader.getForFileContents(localFile));
          if (headerForFile) {
            const fileWithHeader = await inputFile.withFileHeader(headerForFile).resolve();
            return callback(null, fileWithHeader);
          }
          await this.progressBar.logWarn(`Couldn't detect header for ${inputFile.toString()}`);
        }

        // Should not get FileHeader
        return callback(null, inputFile);
      },
    );
  }
}
