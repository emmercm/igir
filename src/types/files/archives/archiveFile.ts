import File, { FileProps } from '../file.js';
import Archive from './archive.js';

export default class ArchiveFile extends File {
  private readonly archive: Archive;

  public constructor(archive: Archive, fileProps?: Omit<FileProps, 'filePath'>) {
    super({
      ...fileProps,
      filePath: archive.getFilePath(),
    });
    this.archive = archive;
  }

  getArchive(): Archive {
    return this.archive;
  }
}
