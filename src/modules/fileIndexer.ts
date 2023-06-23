import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import Module from './module.js';

export default class FileIndexer extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, FileIndexer.name);
  }

  async index(files: File[]): Promise<Map<string, File[]>> {
    if (!files.length) {
      return new Map();
    }

    await this.progressBar.logInfo(`indexing ${files.length.toLocaleString()} file${files.length !== 1 ? 's' : ''}`);

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
        // First, prefer files with their header
        const fileOneHeadered = fileOne.getFileHeader()
          && fileOne.hashCodeWithoutHeader() === hashCode ? 1 : 0;
        const fileTwoHeadered = fileTwo.getFileHeader()
          && fileTwo.hashCodeWithoutHeader() === hashCode ? 1 : 0;
        if (fileOneHeadered !== fileTwoHeadered) {
          return fileOneHeadered - fileTwoHeadered;
        }

        // Second, prefer un-archived files
        const fileOneArchived = fileOne instanceof ArchiveEntry ? 1 : 0;
        const fileTwoArchived = fileTwo instanceof ArchiveEntry ? 1 : 0;
        return fileOneArchived - fileTwoArchived;
      }));

    await this.progressBar.logDebug(`found ${results.size} unique file${results.size !== 1 ? 's' : ''}`);

    await this.progressBar.logInfo('done indexing files');
    return results;
  }

  private static setFileInMap<K>(map: Map<K, File[]>, key: K, file: File): void {
    if (!map.has(key)) {
      map.set(key, [file]);
      return;
    }

    const existing = map.get(key) as File[];
    map.set(key, [...existing, file]);
  }
}
