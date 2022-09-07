import async, { AsyncResultCallback } from 'async';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import ArchiveFactory from '../types/files/archiveFactory.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';

/**
 * Scan the {@link OptionsProps.input} input directory for ROM files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ROMScanner {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  // TODO(cemmer): support for headered ROM files (e.g. NES)
  async scan(): Promise<File[]> {
    await this.progressBar.setSymbol(Symbols.SEARCHING);
    await this.progressBar.reset(0);

    await this.progressBar.logInfo('Scanning ROM files');
    const inputFiles = await this.options.scanInputFilesWithoutExclusions();
    await this.progressBar.reset(inputFiles.length);
    await this.progressBar.logInfo(`Found ${inputFiles.length} ROM file${inputFiles.length !== 1 ? 's' : ''}`);

    return (await async.mapLimit(
      inputFiles,
      Constants.ROM_SCANNER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.increment();

        let files: File[];
        if (ArchiveFactory.isArchive(inputFile)) {
          try {
            files = await ArchiveFactory.archiveFrom(inputFile).getArchiveEntries();
            if (!files.length) {
              await this.progressBar.logWarn(`Found no files in archive: ${inputFile}`);
            }
          } catch (e) {
            await this.progressBar.logError(`Failed to parse archive ${inputFile} : ${e}`);
            files = [];
          }
        } else {
          files = [await new File(inputFile).resolve()];
        }

        callback(null, files);
      },
    )).flatMap((files) => files);
  }
}
