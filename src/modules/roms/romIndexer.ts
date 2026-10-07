import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import ArchiveEntry from '../../models/files/archives/archiveEntry.js';
import Chd from '../../models/files/archives/chd/chd.js';
import Dolphin from '../../models/files/archives/dolphin/dolphin.js';
import Gzip from '../../models/files/archives/gzip.js';
import Maxcso from '../../models/files/archives/maxcso/maxcso.js';
import NkitIso from '../../models/files/archives/nkitIso.js';
import Rar from '../../models/files/archives/rar.js';
import Bzip2 from '../../models/files/archives/sevenZip/bzip2.js';
import Lzma from '../../models/files/archives/sevenZip/lzma.js';
import Lzma86 from '../../models/files/archives/sevenZip/lzma86.js';
import SevenZip from '../../models/files/archives/sevenZip/sevenZip.js';
import Split from '../../models/files/archives/sevenZip/split.js';
import Z from '../../models/files/archives/sevenZip/z.js';
import ZipSpanned from '../../models/files/archives/sevenZip/zipSpanned.js';
import ZipX from '../../models/files/archives/sevenZip/zipX.js';
import Tar from '../../models/files/archives/tar.js';
import Zip from '../../models/files/archives/zip.js';
import type File from '../../models/files/file.js';
import type { AllChecksums, ChecksumsToFiles } from '../../models/indexedFiles.js';
import IndexedFiles from '../../models/indexedFiles.js';
import type Options from '../../models/options.js';
import { PreferFiletype } from '../../models/options.js';
import IntlUtil from '../../utils/intlUtil.js';
import Module from '../module.js';

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
  index(files: File[]): IndexedFiles {
    this.prefixedLogger.trace(
      `indexing ${IntlUtil.toLocaleString(files.length)} file${files.length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.ROM_INDEXING);
    this.progressBar.resetProgress(files.length);

    // Index the files
    const result = IndexedFiles.fromFiles(files);
    // Then apply some sorting preferences
    for (const checksum of Object.keys(result)) {
      this.sortMap(result[checksum as keyof AllChecksums]);
      this.progressBar.incrementCompleted();
    }

    this.prefixedLogger.trace(
      `found ${result.getSize()} unique file${result.getSize() === 1 ? '' : 's'}`,
    );

    this.prefixedLogger.trace('done indexing files');
    return result;
  }

  private sortMap(checksumsToFiles: ChecksumsToFiles): void {
    const outputDir = this.options.getOutputDirRoot();

    for (const [checksum, files] of checksumsToFiles) {
      const sortedFiles = files.toSorted((fileOne, fileTwo) => {
        // First, prefer files that aren't from the output directory
        const fileOneIsOutputFile = fileOne.getCanBeCandidateInput() ? 0 : 1;
        const fileTwoIsOutputFile = fileTwo.getCanBeCandidateInput() ? 0 : 1;
        if (fileOneIsOutputFile !== fileTwoIsOutputFile) {
          return fileOneIsOutputFile - fileTwoIsOutputFile;
        }

        // ********** Preferences that are user-controlled **********

        // Prefer either archives or un-archived/plain files
        let fileOneArchive;
        let fileTwoArchive;
        if (this.options.getPreferFiletype() === PreferFiletype.ARCHIVE) {
          fileOneArchive = fileOne instanceof ArchiveEntry ? 0 : 1;
          fileTwoArchive = fileTwo instanceof ArchiveEntry ? 0 : 1;
        } else {
          fileOneArchive = fileOne instanceof ArchiveEntry ? 1 : 0;
          fileTwoArchive = fileTwo instanceof ArchiveEntry ? 1 : 0;
        }
        if (fileOneArchive !== fileTwoArchive) {
          return fileOneArchive - fileTwoArchive;
        }

        // Then, prefer files whose filename matches the preferred regex
        const preferFilenameRegex = this.options.getPreferFilenameRegex();
        if (preferFilenameRegex) {
          const fileOneMatches = preferFilenameRegex.some((regex) =>
            regex.test(fileOne.getFilePath()),
          )
            ? 0
            : 1;
          const fileTwoMatches = preferFilenameRegex.some((regex) =>
            regex.test(fileTwo.getFilePath()),
          )
            ? 0
            : 1;
          if (fileOneMatches !== fileTwoMatches) {
            return fileOneMatches - fileTwoMatches;
          }
        }

        // ********** Default sorting that is not user-controlled **********

        // Prefer files of the preferred type
        const fileOneArchived = ROMIndexer.archiveEntryPriority(fileOne);
        const fileTwoArchived = ROMIndexer.archiveEntryPriority(fileTwo);
        if (fileOneArchived !== fileTwoArchived) {
          return fileOneArchived - fileTwoArchived;
        }

        // Then, prefer files that are NOT already in the output directory
        // This is in case the output file is invalid and we're trying to overwrite it with
        // something else. Otherwise, we'll just attempt to overwrite the invalid output file with
        // itself, still resulting in an invalid output file.
        if (this.options.getOverwrite() || this.options.getOverwriteInvalid()) {
          const fileOneInOutput = fileOne.getFilePath().startsWith(outputDir) ? 1 : 0;
          const fileTwoInOutput = fileTwo.getFilePath().startsWith(outputDir) ? 1 : 0;
          if (fileOneInOutput !== fileTwoInOutput) {
            return fileOneInOutput - fileTwoInOutput;
          }
        }

        // Otherwise, be deterministic
        return fileOne.toString().localeCompare(fileTwo.toString());
      });
      checksumsToFiles.set(checksum, sortedFiles);
    }
  }

  /**
   * This ordering should match {@link FileFactory#archiveFromArchiveExtension}
   */
  private static archiveEntryPriority(file: File): number {
    if (!(file instanceof ArchiveEntry)) {
      return 0;
    }
    if (file.getArchive() instanceof Zip) {
      return 1;
    }
    if (file.getArchive() instanceof Tar) {
      return 2;
    }
    if (file.getArchive() instanceof Rar) {
      return 3;
    }
    if (file.getArchive() instanceof Gzip) {
      return 4;
    }
    if (file.getArchive() instanceof SevenZip) {
      return 5;
    }
    if (file.getArchive() instanceof Z) {
      return 6;
    }
    if (file.getArchive() instanceof ZipSpanned) {
      return 7;
    }
    if (file.getArchive() instanceof ZipX) {
      return 8;
    }
    if (file.getArchive() instanceof Bzip2) {
      return 9;
    }
    if (file.getArchive() instanceof Lzma86) {
      return 10;
    }
    if (file.getArchive() instanceof Lzma) {
      return 11;
    }
    if (file.getArchive() instanceof Split) {
      return 12;
    }
    if (file.getArchive() instanceof Maxcso) {
      return 13;
    }
    if (file.getArchive() instanceof Dolphin) {
      return 14;
    }
    if (file.getArchive() instanceof Chd) {
      return 15;
    }
    if (file.getArchive() instanceof NkitIso) {
      return 16;
    }
    return 99;
  }
}
