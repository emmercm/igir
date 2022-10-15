import { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import File from '../types/files/file.js';
import Scanner from './scanner.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ROMScanner extends Scanner {
  async scan(): Promise<File[]> {
    await this.progressBar.logInfo('Scanning ROM files');

    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(0);

    const romFilePaths = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(romFilePaths.length);
    await this.progressBar.logInfo(`Found ${romFilePaths.length} ROM file${romFilePaths.length !== 1 ? 's' : ''}`);

    return this.getFilesFromPaths(romFilePaths, Constants.ROM_SCANNER_THREADS);
  }
}
