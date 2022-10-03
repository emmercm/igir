import async, { AsyncResultCallback } from 'async';

import ProgressBar from '../console/progressBar.js';
import ArchiveFactory from '../types/archives/archiveFactory.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';

export default abstract class Scanner {
  protected readonly options: Options;

  protected readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  protected async scanPathsForFiles(
    filePaths: string[],
    threads: number,
    preCallback: (filePath: string) => void | Promise<void>,
  ): Promise<Map<string, File>> {
    return (await async.mapLimit(
      filePaths,
      threads,
      async (filePath, asyncCallback: AsyncResultCallback<File[], Error>) => {
        await preCallback(filePath);
        asyncCallback(null, await this.getFilesFromPath(filePath));
      },
    ))
      .flatMap((files) => files)
      .reduce(Scanner.reduceFilesToIndexByHashCodes, new Map<string, File>());
  }

  private async getFilesFromPath(filePath: string): Promise<File[]> {
    let files: File[];
    if (ArchiveFactory.isArchive(filePath)) {
      try {
        files = await ArchiveFactory.archiveFrom(filePath).getArchiveEntries();
        if (!files.length) {
          await this.progressBar.logWarn(`Found no files in archive: ${filePath}`);
        }
      } catch (e) {
        await this.progressBar.logError(`Failed to parse archive ${filePath} : ${e}`);
        files = [];
      }
    } else {
      files = [await File.fileOf(filePath)];
    }
    return files;
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
