import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import Options from '../types/options.js';
import Scanner from './scanner.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ROMScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, ROMScanner.name);
  }

  /**
   * Scan for ROM files.
   */
  async scan(): Promise<File[]> {
    this.progressBar.logInfo('scanning ROM files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(0);

    const romFilePaths = await this.options.scanInputFilesWithoutExclusions(async (increment) => {
      await this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logDebug(`found ${romFilePaths.length.toLocaleString()} ROM file${romFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(romFilePaths.length);

    const files = await this.getFilesFromPaths(
      romFilePaths,
      this.options.getReaderThreads(),
      this.options.shouldDir2Dat()
        ? ChecksumBitmask.CRC32 | ChecksumBitmask.MD5 | ChecksumBitmask.SHA1
        : ChecksumBitmask.CRC32,
    );

    this.progressBar.logInfo('done scanning ROM files');
    return files;
  }
}
