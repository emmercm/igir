import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import FsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Rar from '../types/files/archives/rar.js';
import SevenZip from '../types/files/archives/sevenZip.js';
import Tar from '../types/files/archives/tar.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import IndexedFiles, { AllChecksums, ChecksumsToFiles } from '../types/indexedFiles.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * This class indexes {@link File}s by their {@link File.hashCode}, and sorts duplicate files by a
 * set of preferences.
 */
export default class ROMIndexer extends Module {
  protected readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, ROMIndexer.name);
    this.options = options;
  }

  /**
   * Index files.
   */
  async index(files: File[]): Promise<IndexedFiles> {
    this.progressBar.logTrace(`indexing ${files.length.toLocaleString()} file${files.length !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.INDEXING);
    // await this.progressBar.reset(files.length);

    // Index the files
    const result = IndexedFiles.fromFiles(files);
    // Then apply some sorting preferences
    Object.keys(result).forEach((checksum) => this.sortMap(result[checksum as keyof AllChecksums]));

    this.progressBar.logTrace(`found ${result.getSize()} unique file${result.getSize() !== 1 ? 's' : ''}`);

    this.progressBar.logTrace('done indexing files');
    return result;
  }

  private sortMap(checksumsToFiles: ChecksumsToFiles): void {
    const outputDir = path.resolve(this.options.getOutputDirRoot());
    const outputDirDisk = FsPoly.disksSync().find((mount) => outputDir.startsWith(mount));

    [...checksumsToFiles.values()]
      .forEach((files) => files
        .sort((fileOne, fileTwo) => {
          // Prefer un-archived files
          const fileOneArchived = ROMIndexer.archiveEntryPriority(fileOne);
          const fileTwoArchived = ROMIndexer.archiveEntryPriority(fileTwo);
          if (fileOneArchived !== fileTwoArchived) {
            return fileOneArchived - fileTwoArchived;
          }

          // Then, prefer files that are NOT already in the output directory
          // This is in case the output file is invalid and we're trying to overwrite it with
          // something else. Otherwise, we'll just attempt to overwrite the invalid output file with
          // itself, still resulting in an invalid output file.
          const fileOneInOutput = path.resolve(fileOne.getFilePath()).startsWith(outputDir) ? 1 : 0;
          const fileTwoInOutput = path.resolve(fileTwo.getFilePath()).startsWith(outputDir) ? 1 : 0;
          if (fileOneInOutput !== fileTwoInOutput) {
            return fileOneInOutput - fileTwoInOutput;
          }

          // Then, prefer files that are on the same disk for fs efficiency see {@link FsPoly#mv}
          if (outputDirDisk) {
            const fileOneInOutputDisk = path.resolve(fileOne.getFilePath())
              .startsWith(outputDirDisk) ? 0 : 1;
            const fileTwoInOutputDisk = path.resolve(fileTwo.getFilePath())
              .startsWith(outputDirDisk) ? 0 : 1;
            if (fileOneInOutputDisk !== fileTwoInOutputDisk) {
              return fileOneInOutputDisk - fileTwoInOutputDisk;
            }
          }

          // Otherwise, be deterministic
          return fileOne.getFilePath().localeCompare(fileTwo.getFilePath());
        }));
  }

  /**
   * This ordering should match {@link FileFactory#entriesFrom}
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
