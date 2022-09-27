import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
import FileHeader from '../types/files/fileHeader.js';
import Options from '../types/options.js';

/**
 * For every input ROM file found, attempt to find a matching header and resolve its
 * header-less checksum.
 *
 * This class will not be run concurrently with any other class.
 */
export default class HeaderProcessor {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async process(inputRomFiles: File[]): Promise<File[]> {
    await this.progressBar.logInfo('Processing file headers');

    await this.progressBar.setSymbol(Symbols.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    return async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_HASHER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();

        // Can get FileHeader from extension, use that
        const headerForExtension = FileHeader.getForFilename(inputFile.getExtractedFilePath());
        if (headerForExtension) {
          await this.progressBar.logDebug(`${inputFile.toString()}: found header by extension: ${headerForExtension}`);
          const fileWithHeader = await (
            await inputFile.withFileHeader(headerForExtension)
          ).resolve();
          return callback(null, fileWithHeader);
        }

        // Should get FileHeader from File, try to
        if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
          const headerForFile = await inputFile
            .extractToStream((stream) => FileHeader.getForFileStream(stream));
          if (headerForFile) {
            await this.progressBar.logDebug(`${inputFile.toString()}: found header by contents: ${headerForExtension}`);
            const fileWithHeader = await (
              await inputFile.withFileHeader(headerForFile)
            ).resolve();
            return callback(null, fileWithHeader);
          }
          await this.progressBar.logWarn(`Couldn't detect header for ${inputFile.toString()}`);
        }

        // Should not get FileHeader
        await this.progressBar.logDebug(`${inputFile.toString()}: no header found`);
        return callback(null, inputFile);
      },
    );
  }
}
