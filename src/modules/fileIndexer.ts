import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Rar from '../types/files/archives/rar.js';
import SevenZip from '../types/files/archives/sevenZip.js';
import Tar from '../types/files/archives/tar.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * This class indexes {@link File}s by their {@link File.hashCode}, and sorts duplicate files by a
 * set of preferences.
 */
export default class FileIndexer extends Module {
  protected readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, FileIndexer.name);
    this.options = options;
  }

  /**
   * Index files.
   */
  async index(files: File[]): Promise<Map<string, File[]>> {
    if (!files.length) {
      return new Map();
    }

    this.progressBar.logInfo(`indexing ${files.length.toLocaleString()} file${files.length !== 1 ? 's' : ''}`);

    await this.progressBar.setSymbol(ProgressBarSymbol.INDEXING);
    // await this.progressBar.reset(files.length);

    const results = new Map<string, File[]>();

    // TODO(cemmer): ability to index files by some other property such as name
    files.forEach((file) => {
      // Index on full file contents
      FileIndexer.setFileInMap(results, file.hashCodeWithHeader(), file);

      // Optionally index without a header
      if (file.getFileHeader()) {
        FileIndexer.setFileInMap(results, file.hashCodeWithoutHeader(), file);
      }
    });

    // Sort the file arrays
    [...results.entries()]
      .forEach(([hashCode, filesForHash]) => filesForHash.sort((fileOne, fileTwo) => {
        // First, prefer "raw" files (files with their header)
        const fileOneHeadered = fileOne.getFileHeader()
          && fileOne.hashCodeWithoutHeader() === hashCode ? 1 : 0;
        const fileTwoHeadered = fileTwo.getFileHeader()
          && fileTwo.hashCodeWithoutHeader() === hashCode ? 1 : 0;
        if (fileOneHeadered !== fileTwoHeadered) {
          return fileOneHeadered - fileTwoHeadered;
        }

        // Then, prefer un-archived files
        const fileOneArchived = FileIndexer.archiveEntryPriority(fileOne);
        const fileTwoArchived = FileIndexer.archiveEntryPriority(fileTwo);
        if (fileOneArchived !== fileTwoArchived) {
          return fileOneArchived - fileTwoArchived;
        }

        // Then, prefer files that are already in the output directory
        const outputDir = path.resolve(this.options.getOutputDirRoot());
        const fileOneInOutput = path.resolve(fileOne.getFilePath()).startsWith(outputDir) ? 0 : 1;
        const fileTwoInOutput = path.resolve(fileTwo.getFilePath()).startsWith(outputDir) ? 0 : 1;
        if (fileOneInOutput !== fileTwoInOutput) {
          return fileOneInOutput - fileTwoInOutput;
        }

        // Otherwise, be deterministic
        return fileOne.getFilePath().localeCompare(fileTwo.getFilePath());
      }));

    this.progressBar.logDebug(`found ${results.size} unique file${results.size !== 1 ? 's' : ''}`);

    this.progressBar.logInfo('done indexing files');
    return results;
  }

  private static setFileInMap<K>(map: Map<K, File[]>, key: K, file: File): void {
    map.set(key, [...(map.get(key) ?? []), file]);
  }

  /**
   * This ordering should match {@link FileFactory#archiveFrom}
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
