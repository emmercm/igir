import async, { AsyncResultCallback } from 'async';

import { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
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
  async scan(): Promise<Map<string, File>> {
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
      .reduce(ROMScanner.reduceFilesToIndexByHashCodes, new Map<string, File>());
  }

  private static reduceFilesToIndexByHashCodes(
    map: Map<string, File>,
    file: File,
  ): Map<string, File> {
    file.hashCodes().forEach((hashCode) => {
      if (map.has(hashCode)) {
        // Have already seen file, prefer non-archived files
        const existing = map.get(hashCode) as File;
        if (!(file instanceof ArchiveEntry) && existing instanceof ArchiveEntry) {
          map.set(hashCode, file);
        }
      } else {
        // Haven't seen file yet, store it
        map.set(hashCode, file);
      }
    });
    return map;
  }
}
