import DriveSemaphore from '../../async/driveSemaphore.js';
import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import File from '../../types/files/file.js';
import { ChecksumBitmask } from '../../types/files/fileChecksums.js';
import FileFactory from '../../types/files/fileFactory.js';
import Options from '../../types/options.js';
import Scanner from '../scanner.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 */
export default class ROMScanner extends Scanner {
  constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    driveSemaphore: DriveSemaphore,
  ) {
    super(options, progressBar, fileFactory, driveSemaphore, ROMScanner.name);
  }

  /**
   * Scan for ROM files.
   */
  async scan(
    checksumBitmask: number = ChecksumBitmask.CRC32,
    checksumArchives = false,
  ): Promise<File[]> {
    this.progressBar.logTrace('scanning ROM files');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    const romFilePaths = await this.options.scanInputFilesWithoutExclusions((increment) => {
      this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logTrace(
      `found ${romFilePaths.length.toLocaleString()} ROM file${romFilePaths.length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.ROM_HASHING);
    this.progressBar.resetProgress(romFilePaths.length);

    const files = await this.getFilesFromPaths(romFilePaths, checksumBitmask, checksumArchives);

    this.progressBar.logTrace('done scanning ROM files');
    return files;
  }
}
