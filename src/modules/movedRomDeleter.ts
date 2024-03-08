import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import Module from './module.js';

/**
 * After all output {@link File}s have been written, delete any input {@link File}s that were
 * "moved." This needs to happen after all writing has finished in order to guarantee we're done
 * reading input {@link File}s from disk.
 *
 * This class will not be run concurrently with any other class.
 */
export default class MovedROMDeleter extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, MovedROMDeleter.name);
  }

  /**
   * Delete input files that were moved.
   */
  async delete(
    inputRoms: File[],
    movedRoms: File[],
    datsToWrittenFiles: Map<DAT, File[]>,
  ): Promise<string[]> {
    if (movedRoms.length === 0) {
      return [];
    }

    this.progressBar.logTrace('deleting moved ROMs');
    await this.progressBar.setSymbol(ProgressBarSymbol.FILTERING);
    await this.progressBar.reset(movedRoms.length);

    const fullyConsumedFiles = this.filterOutPartiallyConsumedArchives(movedRoms, inputRoms);

    const filePathsToDelete = MovedROMDeleter.filterOutWrittenFiles(
      fullyConsumedFiles,
      datsToWrittenFiles,
    );

    await this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    await this.progressBar.reset(filePathsToDelete.length);
    this.progressBar.logTrace(`deleting ${filePathsToDelete.length.toLocaleString()} moved file${filePathsToDelete.length !== 1 ? 's' : ''}`);

    await Promise.all(filePathsToDelete.map(async (filePath) => {
      this.progressBar.logInfo(`deleting moved file: ${filePath}`);
      try {
        await fsPoly.rm(filePath, { force: true });
      } catch {
        this.progressBar.logError(`${filePath}: failed to delete`);
      }
    }));

    this.progressBar.logTrace('done deleting moved ROMs');
    return filePathsToDelete;
  }

  /**
   * Archives that do not have all of their file entries matched should not be deleted during
   *  moving.
   */
  private filterOutPartiallyConsumedArchives(
    movedRoms: File[],
    inputRoms: File[],
  ): string[] {
    const groupedInputRoms = MovedROMDeleter.groupFilesByFilePath(inputRoms);
    const groupedMovedRoms = MovedROMDeleter.groupFilesByFilePath(movedRoms);

    return [...groupedMovedRoms.entries()]
      .map(([filePath, movedEntries]) => {
        // NOTE(cemmer): games can have ROMs with duplicate checksums, which means an Archive of
        //  that game's ROMs will contain some duplicate files. When extracting or zipping, we would
        //  have generated multiple ReleaseCandidates with the same input File, resulting in the
        //  duplicate files in the Archive not being considered "moved." Therefore, we should use
        //  the unique set of ArchiveEntry hash codes to know if every ArchiveEntry was "consumed"
        //  during writing.
        const movedEntryHashCodes = new Set(
          movedEntries.flatMap((file) => file.hashCodes()),
        );

        const inputEntries = groupedInputRoms.get(filePath) ?? [];

        const unmovedEntries = inputEntries.filter((entry) => {
          if (entry instanceof ArchiveEntry
            && movedEntries.length === 1
            && !(movedEntries[0] instanceof ArchiveEntry)
            && movedEntries[0].getFilePath() === entry.getFilePath()
          ) {
            // If the input archive entry was written as a raw archive, then consider it moved
            return false;
          }

          // Otherwise, the entry needs to have been explicitly moved
          return !entry.hashCodes().some((hashCode) => movedEntryHashCodes.has(hashCode));
        });
        if (unmovedEntries.length > 0) {
          this.progressBar.logWarn(`${filePath}: not deleting moved file, ${unmovedEntries.length.toLocaleString()} archive entr${unmovedEntries.length !== 1 ? 'ies were' : 'y was'} unmatched:\n${unmovedEntries.sort().map((entry) => `  ${entry}`).join('\n')}`);
          return undefined;
        }

        return filePath;
      })
      .filter(ArrayPoly.filterNotNullish);
  }

  private static groupFilesByFilePath(files: File[]): Map<string, File[]> {
    return files.reduce((map, file) => {
      const key = file.getFilePath();
      const filesForKey = map.get(key) ?? [];

      filesForKey.push(file);
      const uniqueFilesForKey = filesForKey
        .filter(ArrayPoly.filterUniqueMapped((fileForKey) => fileForKey.toString()));

      map.set(key, uniqueFilesForKey);
      return map;
    }, new Map<string, File[]>());
  }

  /**
   * When an input directory is also used as the output directory, and a file is matched multiple
   *  times, do not delete the input file if it is in a correct location.
   */
  private static filterOutWrittenFiles(
    movedRoms: string[],
    datsToWrittenFiles: Map<DAT, File[]>,
  ): string[] {
    const writtenFilePaths = new Set([...datsToWrittenFiles.values()]
      .flat()
      .map((file) => file.getFilePath()));

    return movedRoms.filter((filePath) => !writtenFilePaths.has(filePath));
  }
}
