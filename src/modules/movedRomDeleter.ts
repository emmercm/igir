import async from 'async';

import type ProgressBar from '../console/progressBar.js';
import { ProgressBarSymbol } from '../console/progressBar.js';
import Defaults from '../globals/defaults.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import IntlPoly from '../polyfill/intlPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import ArchiveFile from '../types/files/archives/archiveFile.js';
import ChdBinCue from '../types/files/archives/chd/chdBinCue.js';
import type File from '../types/files/file.js';
import type IndexedFiles from '../types/indexedFiles.js';
import type Options from '../types/options.js';
import type WriteCandidate from '../types/writeCandidate.js';
import Module from './module.js';

/**
 * After all output {@link File}s have been written, delete any input {@link File}s that were
 * "moved." This needs to happen after all writing has finished to guarantee that we're done
 * reading input {@link File}s from disk.
 */
export default class MovedROMDeleter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, MovedROMDeleter.name);
    this.options = options;
  }

  /**
   * Delete input files that were moved.
   */
  async delete(
    indexedRoms: IndexedFiles,
    movedWriteCandidates: WriteCandidate[],
    writtenFilesToExclude: File[],
  ): Promise<string[]> {
    if (!this.options.shouldMove()) {
      // We shouldn't cause any change to the output directory
      return [];
    }

    if (movedWriteCandidates.length === 0) {
      return [];
    }

    this.progressBar.logTrace('deleting moved ROMs');
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_FILTERING);

    // Get a count of all unique input file paths
    const inputFiles = new Set<string>();
    movedWriteCandidates.forEach((candidate) => {
      candidate
        .getRomsWithFiles()
        .forEach((romWithFiles) => inputFiles.add(romWithFiles.getInputFile().getFilePath()));
    });
    this.progressBar.resetProgress(inputFiles.size);
    this.progressBar.logTrace(
      `considering ${IntlPoly.toLocaleString(inputFiles.size)} unique input paths for deletion`,
    );

    // Take the input files from the WriteCandidates that were moved, and look for duplicate input
    // files that could also be deleted (even if they weren't chosen to be used in a WriteCandidate)
    const movedRoms = new Set<File>();
    movedWriteCandidates.forEach((writeCandidate) => {
      for (const romsWithFiles of writeCandidate.getRomsWithFiles()) {
        const inputFile = romsWithFiles.getInputFile();
        let possibleDuplicates =
          inputFile instanceof ArchiveFile ? [inputFile] : indexedRoms.findFiles(inputFile);

        if (
          this.options.shouldExtractRom(romsWithFiles.getRom()) ||
          this.options.shouldZipRom(romsWithFiles.getRom())
        ) {
          // This moved input file was used to create a different file, it's ok to delete all
          // duplicate input files of any type
        } else if (inputFile instanceof ArchiveFile) {
          // This moved input archive was raw-moved, we can only safely delete duplicate input files
          // of the same exact archive type
          // Note that a moved ArchiveFile would have only found duplicate ArchiveFile of the exact
          // same checksum above
          possibleDuplicates = possibleDuplicates.filter(
            (matchedFile) =>
              (matchedFile instanceof ArchiveEntry || matchedFile instanceof ArchiveFile) &&
              matchedFile.getArchive().constructor.name === inputFile.getArchive().constructor.name,
          );
        } else {
          // This moved plain input file was raw-moved, we can only safely delete plain duplicates
          possibleDuplicates = possibleDuplicates.filter(
            (matchedFile) =>
              !(matchedFile instanceof ArchiveEntry || matchedFile instanceof ArchiveFile),
          );
        }

        possibleDuplicates.forEach((duplicate) => movedRoms.add(duplicate));
      }
    });
    this.progressBar.logTrace(
      `expanded to ${IntlPoly.toLocaleString(movedRoms.size)} possible input files`,
    );

    const fullyConsumedFiles = this.filterOutPartiallyConsumedArchives([...movedRoms], indexedRoms);
    this.progressBar.logTrace(
      `filtered to ${IntlPoly.toLocaleString(fullyConsumedFiles.length)} fully used input files`,
    );

    const filePathsToDelete = MovedROMDeleter.filterOutWrittenFiles(
      fullyConsumedFiles,
      writtenFilesToExclude,
    );
    this.progressBar.logTrace(
      `filtered to ${IntlPoly.toLocaleString(filePathsToDelete.length)} non-output files`,
    );

    this.progressBar.resetProgress(filePathsToDelete.length);
    const existingFilePathsCheck = await async.mapLimit(
      filePathsToDelete,
      Defaults.MAX_FS_THREADS,
      async (filePath: string) => await FsPoly.exists(filePath),
    );
    const existingFilePaths = filePathsToDelete.filter(
      (_filePath, idx) => existingFilePathsCheck.at(idx) === true,
    );
    if (existingFilePaths.length > 0) {
      this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
      this.progressBar.resetProgress(existingFilePaths.length);
      this.progressBar.logTrace(
        `deleting ${IntlPoly.toLocaleString(existingFilePaths.length)} moved file${existingFilePaths.length === 1 ? '' : 's'}`,
      );
    }

    const filePathChunks = existingFilePaths.reduce(
      ArrayPoly.reduceChunk(Defaults.OUTPUT_CLEANER_BATCH_SIZE),
      [],
    );
    for (const filePathChunk of filePathChunks) {
      this.progressBar.setInProgress(filePathChunk.length);
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
      this.progressBar.incrementCompleted(filePathChunk.length);
      this.progressBar.setInProgress(0);
    }

    this.progressBar.logTrace('done deleting moved ROMs');
    return existingFilePaths;
  }

  /**
   * Archives can contain a mixture of ROMs from many different games, so it is possible that not
   * every entry from the archive (or a duplicate of it) was used as an input file for a
   * WriteCandidate. These partially used archives are not safe to delete and need to be filtered
   * out.
   */
  private filterOutPartiallyConsumedArchives(
    movedRoms: File[],
    indexedRoms: IndexedFiles,
  ): string[] {
    const groupedInputRoms = indexedRoms.getFilesByFilePath();
    const groupedMovedRoms = MovedROMDeleter.groupFilesByFilePath(movedRoms);

    // For each moved input path
    return [...groupedMovedRoms.entries()]
      .map(([filePath, movedEntries]) => {
        if (movedEntries.length === 1 && !(movedEntries[0] instanceof ArchiveEntry)) {
          // The input file is either a plain File or an ArchiveFile; either way, it was fully moved
          return filePath;
        }

        /**
         * NOTE(cemmer): games can have ROMs with duplicate checksums, which means an Archive of
         * that game's ROMs will contain some duplicate files. When extracting or zipping, we would
         * have generated multiple {@link WriteCandidate} with the same input File, resulting in the
         * duplicate files in the Archive not being considered "moved." Therefore, we should use
         * the unique set of ArchiveEntry hash codes to know if every ArchiveEntry was "consumed"
         * during writing.
         */
        const movedEntryHashCodes = new Set(movedEntries.map((file) => file.hashCode()));

        const inputFilesForPath = groupedInputRoms.get(filePath) ?? [];

        const unmovedArchiveEntries = inputFilesForPath.filter((inputFile) => {
          if (!(inputFile instanceof ArchiveEntry)) {
            // We're only considering input archive entries
            return false;
          }
          if (movedEntryHashCodes.has(inputFile.hashCode())) {
            // The input archive entry was moved
            return false;
          }
          if (
            inputFile.getArchive() instanceof ChdBinCue &&
            inputFile.getExtractedFilePath().toLowerCase().endsWith('.cue')
          ) {
            // Ignore the .cue file from CHDs
            return false;
          }
          return true;
        });

        if (unmovedArchiveEntries.length === 0) {
          // All archive entries were consumed
          return filePath;
        }

        this.progressBar.logWarn(
          `${filePath}: not deleting moved file, ${IntlPoly.toLocaleString(unmovedArchiveEntries.length)} archive entr${unmovedArchiveEntries.length === 1 ? 'y was' : 'ies were'} unmatched:\n${unmovedArchiveEntries
            .toSorted()
            .map((entry) => `  ${entry.toString()}`)
            .join('\n')}`,
        );
        return undefined;
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
   *  times, don't delete the input file if it is in a correct location.
   */
  private static filterOutWrittenFiles(
    movedRoms: string[],
    writtenFilesToExclude: File[],
  ): string[] {
    const writtenFilePaths = new Set(writtenFilesToExclude.map((file) => file.getFilePath()));

    return movedRoms.filter((filePath) => !writtenFilePaths.has(filePath));
  }
}
