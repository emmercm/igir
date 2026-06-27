import type MappableSemaphore from '../../async/mappableSemaphore.js';
import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type FileFactory from '../../factories/fileFactory.js';
import type File from '../../models/files/file.js';
import { ChecksumBitmask } from '../../models/files/fileChecksums.js';
import type Options from '../../models/options.js';
import IntlUtil from '../../utils/intlUtil.js';
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
    mappableSemaphore: MappableSemaphore,
  ) {
    super(options, progressBar, fileFactory, mappableSemaphore, ROMScanner.name);
  }

  /**
   * Scan for ROM files.
   */
  async scan(
    checksumBitmask: number = ChecksumBitmask.CRC32,
    shouldChecksumArchives = false,
  ): Promise<File[]> {
    this.prefixedLogger.trace('scanning ROM files');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    const inputFilePaths = await this.options.scanInputFilesWithoutExclusions((increment) => {
      this.progressBar.incrementTotal(increment);
    });
    this.prefixedLogger.trace(
      `found ${IntlUtil.toLocaleString(inputFilePaths.length)} input file${inputFilePaths.length === 1 ? '' : 's'}`,
    );
    const filePathsToProcess = inputFilePaths;

    // Depending on some commands, we may want to scan the output directory
    const outputFilePathsSet = new Set<string>();
    if (
      this.options.shouldPlaylist() ||
      this.options.shouldClean() ||
      this.options.shouldReport()
    ) {
      const inputFilePathsSet = new Set(inputFilePaths);
      const outputFilePaths = await this.options.scanOutputFilesWithoutCleanExclusions(
        [this.options.getOutputDirRoot()],
        [],
        (increment) => {
          this.progressBar.incrementTotal(increment);
        },
      );
      this.prefixedLogger.trace(
        `found ${IntlUtil.toLocaleString(outputFilePaths.length)} output file${outputFilePaths.length === 1 ? '' : 's'}`,
      );
      for (const filePath of outputFilePaths) {
        if (!inputFilePathsSet.has(filePath)) {
          filePathsToProcess.push(filePath);
          outputFilePathsSet.add(filePath);
        }
      }
    }

    this.progressBar.setSymbol(ProgressBarSymbol.ROM_HASHING);
    this.progressBar.resetProgress(filePathsToProcess.length);

    let files = await this.getFilesFromPaths(
      filePathsToProcess,
      checksumBitmask,
      shouldChecksumArchives,
    );

    // We need to remember what files came from the output directory so they aren't used for writing
    if (outputFilePathsSet.size > 0) {
      files = files.map((file) => {
        if (!outputFilePathsSet.has(file.getFilePath())) {
          return file;
        }
        return file.withProps({ canBeCandidateInput: false });
      });
    }

    this.prefixedLogger.trace('done scanning ROM files');
    return files;
  }
}
