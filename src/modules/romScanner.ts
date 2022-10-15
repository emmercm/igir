import async, { AsyncResultCallback } from 'async';
import path from 'path';

import { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import Rar from '../types/archives/rar.js';
import SevenZip from '../types/archives/sevenZip.js';
import Tar from '../types/archives/tar.js';
import Zip from '../types/archives/zip.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
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

    return (await async.mapLimit(
      romFilePaths,
      Constants.ROM_SCANNER_THREADS,
      async (inputFile, callback: AsyncResultCallback<File[], Error>) => {
        await this.progressBar.increment();

        const files = await this.getFilesFromPath(inputFile);

        callback(null, files);
      },
    ))
      .flatMap((files) => files)
      // Limit to unique files
      .sort(this.fileComparator.bind(this))
      .filter((one, oneIdx, files) => files.findIndex((two) => {
        const oneHashCodes = one.hashCodes();
        const twoHashCodes = two.hashCodes();
        return twoHashCodes.every((hashCode, hashIdx) => hashCode === oneHashCodes[hashIdx]);
      }) === oneIdx);
  }

  private fileComparator(one: File, two: File): number {
    // Prefer files that are already in the output directory
    const output = path.resolve(this.options.getOutput());
    const outputSort = (path.resolve(one.getFilePath()).startsWith(output) ? 0 : 1)
      - (path.resolve(two.getFilePath()).startsWith(output) ? 0 : 1);
    if (outputSort !== 0) {
      return outputSort;
    }

    // Otherwise, prefer non-archives or more efficient archives
    const archiveEntrySort = ROMScanner.archiveEntryPriority(one)
      - ROMScanner.archiveEntryPriority(two);
    if (archiveEntrySort !== 0) {
      return archiveEntrySort;
    }

    // Otherwise, we don't particularly care
    return one.getFilePath().localeCompare(two.getFilePath());
  }

  /**
   * This ordering should match {@link ArchiveFactory#archiveFrom}
   */
  private static archiveEntryPriority(file: File): number {
    if (!(file instanceof ArchiveEntry)) {
      return 0;
    } if (file.getArchive() instanceof Zip) {
      return 1;
    } if (file.getArchive() instanceof Tar) {
      return 2;
    } if (file.getArchive() instanceof Rar) {
      return 3;
    } if (file.getArchive() instanceof SevenZip) {
      return 4;
    }
    return 99;
  }
}
