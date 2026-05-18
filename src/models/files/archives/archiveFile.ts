import type { FileProps } from '../file.js';
import File from '../file.js';
import type Archive from './archive.js';
import type ArchiveEntry from './archiveEntry.js';

/**
 * A {@link File} that wraps an {@link ArchiveEntry}, exposing the archive and entry while
 * presenting itself as a file at the archive's path.
 */
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
