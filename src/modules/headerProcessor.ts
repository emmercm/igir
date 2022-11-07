import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
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

    await this.progressBar.setSymbol(Symbols.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    const parsedFiles = async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_HASHER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();

        // Can get FileHeader from extension, use that
        const headerForExtension = FileHeader.getForFilename(inputFile.getExtractedFilePath());
        if (headerForExtension) {
          await this.progressBar.logTrace(`${inputFile.toString()}: found header by extension: ${headerForExtension}`);
          const fileWithHeader = await inputFile.withFileHeader(headerForExtension);
          return callback(null, fileWithHeader);
        }

        // Should get FileHeader from File, try to
        if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
          const headerForFile = await inputFile
            .extractToStream(async (stream) => FileHeader.getForFileStream(stream));
          if (headerForFile) {
            await this.progressBar.logTrace(`${inputFile.toString()}: found header by contents: ${headerForExtension}`);
            const fileWithHeader = await inputFile.withFileHeader(headerForFile);
            return callback(null, fileWithHeader);
          }
          await this.progressBar.logWarn(`${inputFile.toString()}: couldn't detect header`);
        }

        // Should not get FileHeader
        return callback(null, inputFile);
      },
    );

    await this.progressBar.logInfo('Done processing file headers');
    return parsedFiles;
  }
}
