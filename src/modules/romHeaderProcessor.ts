import async, { AsyncResultCallback } from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import ROMHeader from '../types/files/romHeader.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * For every input {@link ROM} file found, attempt to find a matching {@link Header} and resolve its
 * header-less checksum.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ROMHeaderProcessor extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, ROMHeaderProcessor.name);
    this.options = options;
  }

  /**
   * Process each {@link File}, finding any {@link Header} present.
   */
  async process(inputRomFiles: File[]): Promise<File[]> {
    if (inputRomFiles.length === 0) {
      return inputRomFiles;
    }

    this.progressBar.logInfo('processing file headers');

    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(inputRomFiles.length);

    const parsedFiles = await async.mapLimit(
      inputRomFiles,
      this.options.getReaderThreads(),
      async (inputFile, callback: AsyncResultCallback<File, Error>) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${inputFile.toString()} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        let fileWithHeader: File | undefined;
        try {
          fileWithHeader = await this.getFileWithHeader(inputFile);
        } catch (error) {
          this.progressBar.logError(`${inputFile.toString()}: failed to process ROM header: ${error}`);
          fileWithHeader = inputFile;
        }

        this.progressBar.removeWaitingMessage(waitingMessage);
        await this.progressBar.incrementDone();

        return callback(undefined, fileWithHeader);
      },
    );

    const headeredRomsCount = parsedFiles.filter((romFile) => romFile.getFileHeader()).length;
    this.progressBar.logDebug(`found headers in ${headeredRomsCount.toLocaleString()} ROM${headeredRomsCount !== 1 ? 's' : ''}`);

    this.progressBar.logInfo('done processing file headers');
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
      this.progressBar.logTrace(`${inputFile.toString()}: reading potentially headered file by filename: ${headerForFilename.getHeaderedFileExtension()}`);
      const fileWithHeader = await inputFile.withFileHeader(headerForFilename);
      if (fileWithHeader.getFileHeader()) {
        this.progressBar.logTrace(`${inputFile.toString()}: found header by filename: ${headerForFilename.getHeaderedFileExtension()}`);
      } else {
        this.progressBar.logTrace(`${inputFile.toString()}: found non-applicable header by filename: ${headerForFilename.getHeaderedFileExtension()}`);
      }
      return fileWithHeader;
    }

    // Should get FileHeader from File, try to
    if (this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())) {
      this.progressBar.logTrace(`${inputFile.toString()}: reading potentially headered file by file contents`);
      const headerForFileStream = await inputFile.createReadStream(
        async (stream) => ROMHeader.headerFromFileStream(stream),
      );
      if (headerForFileStream) {
        this.progressBar.logTrace(`${inputFile.toString()}: found header by file contents: ${headerForFileStream.getHeaderedFileExtension()}`);
        return inputFile.withFileHeader(headerForFileStream);
      }
      this.progressBar.logWarn(`${inputFile.toString()}: didn't find header by file contents`);
    }

    // Should not get FileHeader
    return inputFile;
  }
}
