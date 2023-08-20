import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Module from './module.js';

export default class MovedROMDeleter extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, MovedROMDeleter.name);
  }

  async delete(
    inputRoms: File[],
    movedRoms: File[],
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): Promise<string[]> {
    if (!movedRoms.length) {
      return [];
    }

    this.progressBar.logInfo('deleting moved ROMs');
    await this.progressBar.setSymbol(ProgressBarSymbol.FILTERING);
    await this.progressBar.reset(inputRoms.length);

    const fullyConsumedFiles = this.filterOutPartiallyConsumedArchives(inputRoms, movedRoms);

    const filePathsToDelete = MovedROMDeleter.filterOutWrittenFiles(
      fullyConsumedFiles,
      datsToWrittenRoms,
    );

    await this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    await this.progressBar.reset(filePathsToDelete.length);
    this.progressBar.logDebug(`deleting ${filePathsToDelete.length.toLocaleString()} moved file${filePathsToDelete.length !== 1 ? 's' : ''}`);

    await Promise.all(filePathsToDelete.map(async (filePath) => {
      this.progressBar.logTrace(`${filePath}: deleting moved file`);
      try {
        await fsPoly.rm(filePath, { force: true });
      } catch (e) {
        this.progressBar.logError(`${filePath}: failed to delete`);
      }
    }));

    this.progressBar.logInfo('done deleting moved ROMs');
    return filePathsToDelete;
  }

  /**
   * Archives that do not have all of their file entries matched should not be deleted during
   *  moving.
   */
  private filterOutPartiallyConsumedArchives(
    inputRoms: File[],
    movedRoms: File[],
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
          return entry.hashCodes().some((hashCode) => !movedEntryHashCodes.has(hashCode));
        });
        if (unmovedEntries.length) {
          this.progressBar.logWarn(`${filePath}: not deleting moved file, ${unmovedEntries.length.toLocaleString()} archive entr${unmovedEntries.length !== 1 ? 'ies were' : 'y was'} unmatched:${unmovedEntries.sort().map((entry) => `\n  ${entry}`)}`);
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
      const fileStrings = filesForKey.map((fileForKey) => fileForKey.toString());
      const uniqueFilesForKey = filesForKey
        .filter((_, idx) => fileStrings.indexOf(fileStrings[idx]) === idx);

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
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): string[] {
    const writtenFilePaths = new Set([...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files)
      .map((file) => file.getFilePath()));

    return movedRoms.filter((filePath) => !writtenFilePaths.has(filePath));
  }
}
