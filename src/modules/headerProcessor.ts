import async, { AsyncResultCallback } from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
import FileHeader from '../types/files/fileHeader.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * For every input ROM file found, attempt to find a matching header and resolve its
 * header-less checksum.
 *
 * This class will not be run concurrently with any other class.
 */
export default class HeaderProcessor extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, HeaderProcessor.name);
    this.options = options;
  }

  async process(inputRomFiles: File[]): Promise<File[]> {
    await this.progressBar.logInfo('Processing file headers');

    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    const parsedFiles = async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_PROCESSOR_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();

        return callback(null, await this.getFileWithHeader(inputFile));
      },
    );

    await this.progressBar.logInfo('Done processing file headers');
    return parsedFiles;
  }

  private async getFileWithHeader(inputFile: File): Promise<File> {
    // Can get FileHeader from extension, use that
    const headerForFilename = FileHeader.headerFromFilename(inputFile.getExtractedFilePath());
    if (headerForFilename) {
      await this.progressBar.logTrace(`${inputFile.toString()}: found header by filename: ${headerForFilename}`);
      return inputFile.withFileHeader(headerForFilename);
    }

    // Should get FileHeader from File, try to
    if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
      const headerForFileStream = await inputFile.createReadStream(
        async (stream) => FileHeader.headerFromFileStream(stream),
      );
      if (headerForFileStream) {
        await this.progressBar.logTrace(`${inputFile.toString()}: found header by contents: ${headerForFilename}`);
        return inputFile.withFileHeader(headerForFileStream);
      }
      await this.progressBar.logWarn(`${inputFile.toString()}: couldn't detect header`);
    }

    // Should not get FileHeader
    return inputFile;
  }
}
