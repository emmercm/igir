import async, { AsyncResultCallback } from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import ROMHeader from '../types/files/romHeader.js';
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
    if (!inputRomFiles.length) {
      return inputRomFiles;
    }

    await this.progressBar.logInfo('processing file headers');

    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    const parsedFiles = await async.mapLimit(
      inputRomFiles,
      Constants.ROM_HEADER_PROCESSOR_THREADS,
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.increment();

        return callback(null, await this.getFileWithHeader(inputFile));
      },
    );

    const headeredRomsCount = parsedFiles.filter((romFile) => romFile.getFileHeader()).length;
    await this.progressBar.logDebug(`found headers in ${headeredRomsCount.toLocaleString()} ROM${headeredRomsCount !== 1 ? 's' : ''}`);

    await this.progressBar.logInfo('done processing file headers');
    return parsedFiles;
  }

  private async getFileWithHeader(inputFile: File): Promise<File> {
    /**
     * If the input file is from an archive, and we're not zipping or extracting, then we have no
     * chance to remove the header, so we shouldn't bother detecting one.
     * Matches {@link CandidateGenerator.buildReleaseCandidateForRelease}
     */
    if (inputFile instanceof ArchiveEntry
      && !this.options.canZip()
      && !this.options.shouldExtract()
    ) {
      return inputFile;
    }

    // Can get FileHeader from extension, use that
    const headerForFilename = ROMHeader.headerFromFilename(inputFile.getExtractedFilePath());
    if (headerForFilename) {
      const fileWithHeader = await inputFile.withFileHeader(headerForFilename);
      if (fileWithHeader.getFileHeader()) {
        await this.progressBar.logTrace(`${inputFile.toString()}: found header by filename: ${headerForFilename.getHeaderedFileExtension()}`);
      } else {
        await this.progressBar.logTrace(`${inputFile.toString()}: didn't find header by filename: ${headerForFilename.getHeaderedFileExtension()}`);
      }
      return fileWithHeader;
    }

    // Should get FileHeader from File, try to
    if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
      const headerForFileStream = await inputFile.createReadStream(
        async (stream) => ROMHeader.headerFromFileStream(stream),
      );
      if (headerForFileStream) {
        await this.progressBar.logTrace(`${inputFile.toString()}: found header by file contents: ${headerForFileStream.getHeaderedFileExtension()}`);
        return inputFile.withFileHeader(headerForFileStream);
      }
      await this.progressBar.logWarn(`${inputFile.toString()}: didn't find header by file contents`);
    }

    // Should not get FileHeader
    return inputFile;
  }
}
