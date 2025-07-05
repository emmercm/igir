import type { FileProps } from '../file.js';
import File from '../file.js';
import type Archive from './archive.js';

export default class ArchiveFile extends File {
  private readonly archive: Archive;

  constructor(archive: Archive, fileProps?: Omit<FileProps, 'filePath'>) {
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
