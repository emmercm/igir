import path from 'path';

import ArchiveEntry from './archiveEntry.js';
import File from './file.js';

export default abstract class Archive extends File {
  isZip(): boolean {
    return path.extname(this.getFilePath()).toLowerCase() === '.zip';
  }

  abstract getArchiveEntries(): Promise<ArchiveEntry[]>;

  abstract extractEntry(
    archiveEntry: ArchiveEntry,
    callback: (localFile: string) => (void | Promise<void>),
  ): Promise<void>;
}
