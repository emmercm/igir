import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';

export default class ROMIndexer {
  static index(files: File[]): Map<string, File> {
    return files.reduce((map, file) => {
      // TODO(cemmer): ability to index files by some other property such as name
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
    }, new Map<string, File>());
  }
}
