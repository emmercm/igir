import File, { FileProps } from '../file.js';
import Archive from './archive.js';

export default class ArchiveFile extends File {
  private readonly archive: Archive;

  public constructor(archive: Archive, fileProps: FileProps) {
    super(fileProps);
    this.archive = archive;
  }

  getArchive(): Archive {
    return this.archive;
  }
}
