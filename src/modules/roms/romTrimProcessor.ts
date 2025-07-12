import async from 'async';

import type DriveSemaphore from '../../async/driveSemaphore.js';
import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import Defaults from '../../globals/defaults.js';
import type File from '../../types/files/file.js';
import type FileFactory from '../../types/files/fileFactory.js';
import type Options from '../../types/options.js';
import Module from '../module.js';

/**
 * TODO(cemmer)
 */
export default class ROMTrimProcessor extends Module {
  private static readonly POSSIBLE_FILL_BYTES = [0x00, 0xff];

  private readonly options: Options;
  private readonly fileFactory: FileFactory;
  private readonly driveSemaphore: DriveSemaphore;

  constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    driveSemaphore: DriveSemaphore,
  ) {
    super(progressBar, ROMTrimProcessor.name);
    this.options = options;
    this.fileFactory = fileFactory;
    this.driveSemaphore = driveSemaphore;
  }

  /**
   * TODO(cemmer)
   */
  async process(inputRomFiles: File[]): Promise<File[]> {
    if (inputRomFiles.length === 0) {
      return inputRomFiles;
    }

    if (!this.options.usingDats()) {
      // We don't care about detecting trimming if we're not matching to a DAT
      return inputRomFiles;
    }

    const filesThatNeedProcessing = inputRomFiles.filter((inputFile) =>
      this.fileNeedsProcessing(inputFile),
    ).length;
    if (filesThatNeedProcessing === 0) {
      this.progressBar.logTrace('no ROMs can be trimmed');
      return inputRomFiles;
    }

    this.progressBar.logTrace(
      `processing trimming in ${inputRomFiles.length.toLocaleString()} ROM${inputRomFiles.length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.ROM_TRIMMING_DETECTION);
    this.progressBar.resetProgress(filesThatNeedProcessing);

    const parsedFiles = await async.mapLimit(
      inputRomFiles,
      Defaults.MAX_FS_THREADS,
      async (inputFile: File) => {
        if (!this.fileNeedsProcessing(inputFile)) {
          return inputFile;
        }

        return this.driveSemaphore.runExclusive(inputFile, async () => {
          this.progressBar.incrementInProgress();
          const childBar = this.progressBar.addChildBar({
            name: inputFile.toString(),
          });
          // TODO(cemmer): why isn't this creating the progress bar?

          let fileWithTrimming: File;
          try {
            fileWithTrimming = await this.getFile(inputFile);
          } catch (error) {
            this.progressBar.logError(
              `${inputFile.toString()}: failed to process ROM trimming: ${error}`,
            );
            fileWithTrimming = inputFile;
          } finally {
            childBar.delete();
          }
          this.progressBar.incrementCompleted();

          return fileWithTrimming;
        });
      },
    );

    const trimmedRomsCount = parsedFiles.filter(
      (romFile) => romFile.getPaddings().length > 0,
    ).length;
    this.progressBar.logTrace(
      `found ${trimmedRomsCount.toLocaleString()} trimmed ROM${trimmedRomsCount === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace('done processing file trimming');
    return parsedFiles;
  }

  private fileNeedsProcessing(inputFile: File): boolean {
    if (inputFile.getSize() === 0 || (inputFile.getSize() & (inputFile.getSize() - 1)) === 0) {
      // Is a power of two, so it isn't trimmed
      return false;
    }

    return true;
  }

  private async getFile(inputFile: File): Promise<File> {
    const fileSignature = await this.fileFactory.signatureFrom(inputFile);
    if (!fileSignature?.canBeTrimmed()) {
      // This file isn't known to be trimmable
      return inputFile;
    }

    const paddings = await this.fileFactory.paddingsFrom(inputFile);
    if (paddings.length === 0) {
      // This file isn't trimmed
      return inputFile;
    }

    return inputFile.withPaddings(paddings);
  }
}
