import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
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

  async scan(): Promise<File[]> {
    await this.progressBar.logInfo('scanning ROM files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(this.options.getInputFileCount());

    const romFilePaths = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.logDebug(`found ${romFilePaths.length.toLocaleString()} ROM file${romFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(romFilePaths.length);

    const files = await this.getFilesFromPaths(
      romFilePaths,
      Constants.ROM_SCANNER_THREADS,
      this.options.usingDats(),
    );

    await this.progressBar.doneItems(files.length, `${this.options.usingDats() ? 'unique ' : ''}ROM`, 'found');

    await this.progressBar.logInfo('done scanning ROM files');
    return files;
  }
}
