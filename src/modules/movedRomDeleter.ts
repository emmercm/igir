import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
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
  ): Promise<void> {
    if (!movedRoms.length) {
      return;
    }

    await this.progressBar.logInfo('deleting moved ROMs');
    await this.progressBar.setSymbol(ProgressBarSymbol.FILTERING);
    await this.progressBar.reset(inputRoms.length);

    const fullyConsumedFiles = await this.filterOutPartiallyConsumedArchives(inputRoms, movedRoms);

    const filesToDelete = MovedROMDeleter.filterOutWrittenFiles(
      fullyConsumedFiles,
      datsToWrittenRoms,
    );

    await this.progressBar.setSymbol(ProgressBarSymbol.DELETING);
    await this.progressBar.reset(filesToDelete.length);
    await this.progressBar.logDebug(`deleting ${filesToDelete.length.toLocaleString()} moved file${filesToDelete.length !== 1 ? 's' : ''}`);

    await Promise.all(filesToDelete.map(async (filePath) => {
      await this.progressBar.logTrace(`${filePath}: deleting moved file`);
      try {
        await fsPoly.rm(filePath, { force: true });
      } catch (e) {
        await this.progressBar.logError(`${filePath}: failed to delete`);
      }
    }));

    await this.progressBar.doneItems(filesToDelete.length, 'moved file', 'deleted');
    await this.progressBar.logInfo('done deleting moved ROMs');
  }

  /**
   * Archives that do not have all of their file entries matched should not be deleted during
   *  moving.
   */
  private async filterOutPartiallyConsumedArchives(
    inputRoms: File[],
    movedRoms: File[],
  ): Promise<string[]> {
    const groupedInputRoms = MovedROMDeleter.groupFilesByFilePath(inputRoms);
    const groupedMovedRoms = MovedROMDeleter.groupFilesByFilePath(movedRoms);

    return (await Promise.all(
      [...groupedMovedRoms.entries()].map(async ([filePath, movedEntries]) => {
        const inputEntries = groupedInputRoms.get(filePath) || [];

        const unmovedEntries = inputEntries.filter((entry) => movedEntries.indexOf(entry) === -1);
        if (unmovedEntries.length) {
          await this.progressBar.logWarn(`${filePath}: not deleting moved file, ${unmovedEntries.length.toLocaleString()} archive entr${unmovedEntries.length !== 1 ? 'ies were' : 'y was'} unmatched:${unmovedEntries.sort().map((entry) => `\n  ${entry}`)}`);
          return undefined;
        }

        return filePath;
      }),
    )).filter((filePath) => filePath) as string[];
  }

  private static groupFilesByFilePath(files: File[]): Map<string, string[]> {
    return files.reduce((map, file) => {
      const key = file.getFilePath();
      const extractedPaths = map.get(key) || [];

      extractedPaths.push(file.getExtractedFilePath());
      const uniqueExtractedPaths = extractedPaths
        .filter((path, idx, paths) => paths.indexOf(path) === idx);

      map.set(key, uniqueExtractedPaths);
      return map;
    }, new Map<string, string[]>());
  }

  /**
   * When an input directory is also used as the output directory, and a file is matched multiple
   *  times, do not delete the input file if it is in a correct location.
   */
  private static filterOutWrittenFiles(
    movedRoms: string[],
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): string[] {
    const writtenFilePaths = [...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files)
      .reduce((map, file) => {
        map.set(file.getFilePath(), true);
        return map;
      }, new Map<string, boolean>());

    return movedRoms.filter((filePath) => !writtenFilePaths.has(filePath));
  }
}
