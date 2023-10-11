import fs from 'node:fs';
import path from 'node:path';

import tar from 'tar';
import { Memoize } from 'typescript-memoize';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import FileChecksums from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class Tar extends Archive {
  static readonly SUPPORTED_EXTENSIONS = [
    '.tar',
    '.tar.gz', '.tgz',
  ];

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Tar(filePath);
  }

  @Memoize()
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Tar>[]> {
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

    writeStream.on('entry', async (entry) => {
      const checksums = await FileChecksums.hashStream(entry, checksumBitmask);
      archiveEntryPromises.push(ArchiveEntry.entryOf(
        this,
        entry.path,
        entry.size ?? 0,
        checksums,
        checksumBitmask,
      ));
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
    await using disposableStack = new AsyncDisposableStack();

    const tempDir = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'tar'));
    disposableStack.defer(async () => fsPoly.rm(tempDir, { recursive: true, force: true }));

    // https://github.com/isaacs/node-tar/issues/357
    const tempFile = path.join(tempDir, entryPath);

    await tar.extract({
      file: this.getFilePath(),
      cwd: tempDir,
      strict: true,
    }, [entryPath.replace(/[\\/]/g, '/')]);

    await fsPoly.mv(tempFile, extractedFilePath);
  }
}
