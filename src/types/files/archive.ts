import ArchiveEntry from './archiveEntry.js';
import File from './file.js';

export default abstract class Archive extends File {
  abstract getArchiveEntries(): Promise<ArchiveEntry[]>;

  abstract extractEntry<T>(
    archiveEntry: ArchiveEntry,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T>;
}
