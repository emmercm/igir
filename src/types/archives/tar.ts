import crc32 from 'crc/crc32';
import fs from 'fs';
import path from 'path';
import tar from 'tar';

import ArchiveEntry from '../files/archiveEntry.js';
import Archive from './archive.js';

export default class Tar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = [
    '.tar',
    '.tar.gz', '.tgz',
  ];

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Tar(filePath);
  }

  async getArchiveEntries(): Promise<ArchiveEntry<Tar>[]> {
    const archiveEntryPromises: Promise<ArchiveEntry<Tar>>[] = [];

    // WARN(cemmer): entries in tar archives don't have headers, the entire file has to be read to
    // calculate the CRCs
    let errorMessage;
    const writeStream = new tar.Parse({
      onwarn: (code, message): void => {
        errorMessage = `${code}: ${message}`;
      },
    });
    fs.createReadStream(this.getFilePath()).pipe(writeStream);

    writeStream.on('entry', (entry) => {
      let crc: number;
      entry.on('data', (chunk) => {
        if (!crc) {
          crc = crc32(chunk);
        } else {
          crc = crc32(chunk, crc);
        }
      });
      entry.on('end', () => {
        archiveEntryPromises.push(ArchiveEntry.entryOf(
          this,
          entry.path,
          entry.size || 0,
          (crc || 0).toString(16),
        ));
      });
    });

    // Wait for the tar file to be closed
    await new Promise<void>((resolve) => {
      writeStream.on('end', () => resolve());
    });

    // NOTE(cemmer): for whatever promise hell reason, if we tell `tar` to be strict, the exception
    //  it throws can't be caught by the caller of this function, so we do this
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return Promise.all(archiveEntryPromises);
  }

  async extractEntryToFile<T>(
    entryPath: string,
    tempDir: string,
    callback: (localFile: string) => (Promise<T> | T),
  ): Promise<T> {
    await tar.extract({
      file: this.getFilePath(),
      cwd: tempDir,
      filter: (tarPath) => path.normalize(tarPath) === path.normalize(entryPath),
      strict: true,
    });

    return callback(path.join(tempDir, entryPath));
  }
}
