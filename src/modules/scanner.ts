import ProgressBar from '../console/progressBar.js';
import ArchiveFactory from '../types/archives/archiveFactory.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';

export default abstract class Scanner {
  protected readonly options: Options;

  protected readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  protected async getFilesFromPath(filePath: string): Promise<File[]> {
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
}
