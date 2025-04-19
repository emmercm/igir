import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Defaults from '../globals/defaults.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import ArchiveFile from '../types/files/archives/archiveFile.js';
import File from '../types/files/file.js';
import Module from './module.js';

/**
 * After all output {@link File}s have been written, delete any input {@link File}s that were
 * "moved." This needs to happen after all writing has finished in order to guarantee we're done
 * reading input {@link File}s from disk.
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
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_FILTERING);
    this.progressBar.reset(movedRoms.length);

    const fullyConsumedFiles = this.filterOutPartiallyConsumedArchives(movedRoms, inputRoms);

    const filePathsToDelete = MovedROMDeleter.filterOutWrittenFiles(
      fullyConsumedFiles,
      datsToWrittenFiles,
    );

    const existingFilePathsCheck = await async.mapLimit(
      filePathsToDelete,
      Defaults.MAX_FS_THREADS,
      async (filePath: string) => FsPoly.exists(filePath),
    );
    const existingFilePaths = filePathsToDelete.filter(
      (_filePath, idx) => existingFilePathsCheck.at(idx) === true,
    );

    this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    this.progressBar.reset(existingFilePaths.length);
    this.progressBar.logTrace(
      `deleting ${existingFilePaths.length.toLocaleString()} moved file${existingFilePaths.length === 1 ? '' : 's'}`,
    );

    const filePathChunks = existingFilePaths.reduce(
      ArrayPoly.reduceChunk(Defaults.OUTPUT_CLEANER_BATCH_SIZE),
      [],
    );
    for (const filePathChunk of filePathChunks) {
      this.progressBar.logInfo(
        `deleting moved file${filePathChunk.length === 1 ? '' : 's'}:\n${filePathChunk.map((filePath) => `  ${filePath}`).join('\n')}`,
      );
      await Promise.all(
        filePathChunk.map(async (filePath) => {
          try {
            await FsPoly.rm(filePath, { force: true });
          } catch (error) {
            this.progressBar.logError(`${filePath}: failed to delete: ${error}`);
          }
        }),
      );
    }

    this.progressBar.logTrace('done deleting moved ROMs');
    return existingFilePaths;
  }

  /**
   * Archives that do not have all of their file entries matched should not be deleted during
   *  moving.
   */
  private filterOutPartiallyConsumedArchives(movedRoms: File[], inputRoms: File[]): string[] {
    const groupedInputRoms = MovedROMDeleter.groupFilesByFilePath(inputRoms);
    const groupedMovedRoms = MovedROMDeleter.groupFilesByFilePath(movedRoms);

    return [...groupedMovedRoms.entries()]
      .map(([filePath, movedEntries]) => {
        /**
         * NOTE(cemmer): games can have ROMs with duplicate checksums, which means an Archive of
         * that game's ROMs will contain some duplicate files. When extracting or zipping, we would
         * have generated multiple {@link WriteCandidate} with the same input File, resulting in the
         * duplicate files in the Archive not being considered "moved." Therefore, we should use
         * the unique set of ArchiveEntry hash codes to know if every ArchiveEntry was "consumed"
         * during writing.
         */
        const movedEntryHashCodes = new Set(movedEntries.flatMap((file) => file.hashCode()));

        const inputFilesForPath = groupedInputRoms.get(filePath) ?? [];
        const inputFileIsArchive = inputFilesForPath.some(
          (inputFile) => inputFile instanceof ArchiveEntry,
        );

        const unmovedFiles = inputFilesForPath.filter(
          (inputFile) =>
            !(inputFile instanceof ArchiveEntry) &&
            // The input archive entry needs to have been explicitly moved
            !movedEntryHashCodes.has(inputFile.hashCode()),
        );

        if (inputFileIsArchive && unmovedFiles.length === 0) {
          // The input file is an archive, and it was fully extracted OR the archive file itself was
          // an exact match and was moved as-is
          return filePath;
        }

        const unmovedArchiveEntries = inputFilesForPath.filter((inputFile) => {
          if (!(inputFile instanceof ArchiveEntry)) {
            return false;
          }

          if (movedEntries.length === 1 && movedEntries[0] instanceof ArchiveFile) {
            // If the input archive was written as a raw archive, then consider it moved
            return false;
          }

          // Otherwise, the input archive entry needs to have been explicitly moved
          return !movedEntryHashCodes.has(inputFile.hashCode());
        });

        if (inputFileIsArchive && unmovedArchiveEntries.length === 0) {
          // The input file is an archive and it was fully zipped
          return filePath;
        }

        const unmovedEntries = [...unmovedFiles, ...unmovedArchiveEntries];
        if (unmovedEntries.length > 0) {
          this.progressBar.logWarn(
            `${filePath}: not deleting moved file, ${unmovedEntries.length.toLocaleString()} archive entr${unmovedEntries.length === 1 ? 'y was' : 'ies were'} unmatched:\n${unmovedEntries
              .sort()
              .map((entry) => `  ${entry.toString()}`)
              .join('\n')}`,
          );
          return undefined;
        }

        return filePath;
      })
      .filter((filePath) => filePath !== undefined);
  }

  private static groupFilesByFilePath(files: File[]): Map<string, File[]> {
    return files.reduce((map, file) => {
      const key = file.getFilePath();
      const filesForKey = map.get(key) ?? [];

      filesForKey.push(file);
      const uniqueFilesForKey = filesForKey.filter(
        ArrayPoly.filterUniqueMapped((fileForKey) => fileForKey.toString()),
      );

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
    const writtenFilePaths = new Set(
      [...datsToWrittenFiles.values()].flat().map((file) => file.getFilePath()),
    );

    return movedRoms.filter((filePath) => !writtenFilePaths.has(filePath));
  }
}
