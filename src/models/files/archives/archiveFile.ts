import type { FileProps } from '../file.js';
import File from '../file.js';
import type Archive from './archive.js';
import type ArchiveEntry from './archiveEntry.js';

export default class ArchiveFile extends File {
  private readonly archiveEntry: ArchiveEntry<Archive>;

  constructor(archiveEntry: ArchiveEntry<Archive>, fileProps?: Omit<FileProps, 'filePath'>) {
    super({
      ...fileProps,
      filePath: archiveEntry.getFilePath(),
    });
    this.archiveEntry = archiveEntry;
  }

  getArchive(): Archive {
    return this.archiveEntry.getArchive();
  }

  getArchiveEntry(): ArchiveEntry<Archive> {
    return this.archiveEntry;
  }
}
