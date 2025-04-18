import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DriveSemaphore from '../../driveSemaphore.js';
import Defaults from '../../globals/defaults.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import File from '../../types/files/file.js';
import FileFactory from '../../types/files/fileFactory.js';
import ROMHeader from '../../types/files/romHeader.js';
import Options from '../../types/options.js';
import Module from '../module.js';

/**
 * For every input {@link ROM} file found, attempt to find a matching {@link Header} and resolve its
 * header-less checksum.
 */
export default class ROMHeaderProcessor extends Module {
  private readonly options: Options;

  private readonly fileFactory: FileFactory;

  private readonly driveSemaphore: DriveSemaphore;

  constructor(options: Options, progressBar: ProgressBar, fileFactory: FileFactory) {
    super(progressBar, ROMHeaderProcessor.name);
    this.options = options;
    this.fileFactory = fileFactory;
    this.driveSemaphore = new DriveSemaphore(this.options.getReaderThreads());
  }

  /**
   * Process each {@link File}, finding any {@link Header} present.
   */
  async process(inputRomFiles: File[]): Promise<File[]> {
    if (inputRomFiles.length === 0) {
      return inputRomFiles;
    }

    const filesThatNeedProcessing = inputRomFiles.filter((inputFile) =>
      this.fileNeedsProcessing(inputFile),
    ).length;
    if (filesThatNeedProcessing === 0) {
      this.progressBar.logTrace('no ROMs need their header processed');
      return inputRomFiles;
    }

    this.progressBar.logTrace(
      `processing headers in ${filesThatNeedProcessing.toLocaleString()} ROM${filesThatNeedProcessing === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.ROM_HEADER_DETECTION);
    this.progressBar.reset(filesThatNeedProcessing);

    const parsedFiles = await async.mapLimit(
      inputRomFiles,
      Defaults.MAX_FS_THREADS,
      async (inputFile: File) => {
        if (!this.fileNeedsProcessing(inputFile)) {
          return inputFile;
        }

        return this.driveSemaphore.runExclusive(inputFile, async () => {
          this.progressBar.incrementProgress();
          const waitingMessage = `${inputFile.toString()} ...`;
          this.progressBar.addWaitingMessage(waitingMessage);

          let fileWithHeader: File | undefined;
          try {
            fileWithHeader = await this.getFileWithHeader(inputFile);
          } catch (error) {
            this.progressBar.logError(
              `${inputFile.toString()}: failed to process ROM header: ${error}`,
            );
            fileWithHeader = inputFile;
          }

          this.progressBar.removeWaitingMessage(waitingMessage);
          this.progressBar.incrementDone();

          return fileWithHeader;
        });
      },
    );

    const headeredRomsCount = parsedFiles.filter(
      (romFile) => romFile.getFileHeader() !== undefined,
    ).length;
    this.progressBar.logTrace(
      `found headers in ${headeredRomsCount.toLocaleString()} ROM${headeredRomsCount === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace('done processing file headers');
    return parsedFiles;
  }

  private fileNeedsProcessing(inputFile: File): boolean {
    /**
     * If the input file is from an archive, and we're not zipping or extracting, then we have no
     * chance to remove the header, so we shouldn't bother detecting one.
     * Matches {@link CandidateGenerator#buildCandidateForGame}
     */
    if (
      inputFile instanceof ArchiveEntry &&
      !this.options.shouldZip() &&
      !this.options.shouldExtract()
    ) {
      return false;
    }

    return (
      ROMHeader.headerFromFilename(inputFile.getExtractedFilePath()) !== undefined ||
      this.options.shouldReadFileForHeader(inputFile.getExtractedFilePath())
    );
  }

  private async getFileWithHeader(inputFile: File): Promise<File> {
    this.progressBar.logTrace(
      `${inputFile.toString()}: reading potentially headered file by file contents`,
    );
    const headerForFileStream = await this.fileFactory.headerFrom(inputFile);
    if (headerForFileStream) {
      this.progressBar.logTrace(
        `${inputFile.toString()}: found header by file contents: ${headerForFileStream.getHeaderedFileExtension()}`,
      );
      return inputFile.withFileHeader(headerForFileStream);
    }
    this.progressBar.logTrace(`${inputFile.toString()}: didn't find header by file contents`);
    return inputFile;
  }
}
