import crc32 from 'crc/crc32';
import fs from 'fs';
import path from 'path';
import tar from 'tar';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
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
    fs.createReadStream(this.getFilePath(), {
      highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
    }).pipe(writeStream);

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
      writeStream.on('end', resolve);
    });

    // NOTE(cemmer): for whatever promise hell reason, if we tell `tar` to be strict, the exception
    //  it throws can't be caught by the caller of this function, so we do this
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return Promise.all(archiveEntryPromises);
  }

  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'tar'));
    try {
      // https://github.com/isaacs/node-tar/issues/357
      const tempFile = path.join(tempDir, entryPath);

      await tar.extract({
        file: this.getFilePath(),
        cwd: tempDir,
        strict: true,
      }, [entryPath.replace(/[\\/]/g, '/')]);

      await fsPoly.mv(tempFile, extractedFilePath);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }
}
