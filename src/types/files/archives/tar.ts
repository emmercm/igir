import fs from 'node:fs';
import path from 'node:path';

import tar from 'tar';

import Defaults from '../../../constants/defaults.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import FileChecksums from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class Tar extends Archive {
  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Tar(filePath);
  }

  static getExtensions(): string[] {
    return ['.tar', '.tar.gz', '.tgz'];
  }

  getExtension(): string {
    // We can't reliably know the extension
    return path.parse(this.getFilePath()).ext;
  }

  static getFileSignatures(): Buffer[] {
    return [
      // .tar
      Buffer.from('7573746172003030', 'hex'),
      Buffer.from('7573746172202000', 'hex'),
      // .tar.gz / .tgz
      Buffer.from('1F8B08', 'hex'), // deflate
    ];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    const archiveEntryPromises: Promise<ArchiveEntry<this>>[] = [];

    // WARN(cemmer): entries in tar archives don't have headers, the entire file has to be read to
    // calculate the CRCs
    let errorMessage: string | undefined;
    const writeStream = new tar.Parse({
      onwarn: (code, message): void => {
        errorMessage = `${code}: ${message}`;
      },
    });
    const readStream = fs.createReadStream(this.getFilePath(), {
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    readStream.pipe(writeStream);

    // Note: entries are read sequentially, so entry streams need to be fully read or resumed
    writeStream.on('entry', async (entry) => {
      const checksums = await FileChecksums.hashStream(entry, checksumBitmask);
      archiveEntryPromises.push(ArchiveEntry.entryOf({
        archive: this,
        entryPath: entry.path,
        size: entry.size,
        ...checksums,
      }, checksumBitmask));
      // In case we didn't need to read the stream for hashes, resume the file reading
      entry.resume();
    });

    // Wait for the tar file to be closed
    await new Promise<void>((resolve, reject) => {
      writeStream.on('end', resolve);
      readStream.on('error', reject);
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
    await tar.extract({
      file: this.getFilePath(),
      cwd: path.dirname(extractedFilePath),
      strict: true,
      filter: (_, stat) => {
        // @ts-expect-error the type is wrong: https://github.com/isaacs/node-tar/issues/357#issuecomment-1416806436
        // eslint-disable-next-line no-param-reassign
        stat.path = path.basename(extractedFilePath);
        return true;
      },
    }, [entryPath.replace(/[\\/]/g, '/')]);
    if (!await FsPoly.exists(extractedFilePath)) {
      throw new Error(`didn't find entry '${entryPath}'`);
    }
  }
}
