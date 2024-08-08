import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import Scanner from './scanner.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 */
export default class ROMScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar, fileFactory: FileFactory) {
    super(options, progressBar, fileFactory, ROMScanner.name);
  }

  /**
   * Scan for ROM files.
   */
  async scan(
    checksumBitmask: number = ChecksumBitmask.CRC32,
    checksumArchives = false,
  ): Promise<File[]> {
    this.progressBar.logTrace('scanning ROM files');
    await this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    await this.progressBar.reset(0);

    const romFilePaths = await this.options.scanInputFilesWithoutExclusions(async (increment) => {
      await this.progressBar.incrementTotal(increment);
    });
    this.progressBar.logTrace(`found ${romFilePaths.length.toLocaleString()} ROM file${romFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.FILE_HASHING);
    await this.progressBar.reset(romFilePaths.length);

    const files = await this.getFilesFromPaths(
      romFilePaths,
      this.options.getReaderThreads(),
      checksumBitmask,
      checksumArchives,
    );

    this.progressBar.logTrace('done scanning ROM files');
    return files;
  }
}
