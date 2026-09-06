import fs from 'node:fs';
import path from 'node:path';
import type stream from 'node:stream';

import * as tar from 'tar';

import IgirException from '../../../exceptions/igirException.js';
import Defaults from '../../../globals/defaults.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import FsUtil from '../../../utils/fsUtil.js';
import FileChecksums from '../fileChecksums.js';
import type { ArchiveEntryLocation } from './archive.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

/**
 * A tar (or gzipped tar) archive.
 */
export default class Tar extends Archive {
  /**
   * Construct a new {@link Tar} archive for the given file path.
   */
  protected new(filePath: string): Archive {
    return new Tar(filePath);
  }

  static getExtensions(): string[] {
    return ['.tar', '.tar.gz', '.tgz'];
  }

  /**
   * Returns true: tar archives support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns true: tar archives store entry paths.
   */
  hasMeaningfulEntryPaths(): boolean {
    return true;
  }

  getExtension(): string {
    for (const ext of Tar.getExtensions()) {
      if (this.getFilePath().toLowerCase().endsWith(ext)) {
        return ext;
      }
    }
    return path.parse(this.getFilePath()).ext;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<this>[]> {
    const archiveEntryPromises: Promise<ArchiveEntry<this>>[] = [];

    // WARN(cemmer): entries in tar archives don't have headers, the entire file has to be read to
    // calculate the CRCs, so the CRC32 is always recalculated regardless of _forceChecksumCalculation
    let errorMessage: string | undefined;
    const writeStream = new tar.Parser({
      onwarn: (code, message): void => {
        errorMessage = `${code}: ${message}`;
      },
    });
    const readStream = fs.createReadStream(this.getFilePath(), {
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    // TODO(cemmer): callback() with the sum of uncompressed file sizes
    let overallProgress = 0;

    // Constructed before the 'entry' listener below so that a failure reading any one entry can
    // reject it, rather than the rejection having nowhere to go
    let rejectParsed: (reason: unknown) => void;
    // Wait for the tar file to be closed
    const parsed = new Promise<void>((resolve, reject) => {
      rejectParsed = reject;
      writeStream.on('end', resolve);
      readStream.on('error', reject);
      writeStream.on('error', reject);
    });

    // Note: entries are read sequentially, so entry streams need to be fully read or resumed
    writeStream.on('entry', (entry: tar.ReadEntry) => {
      // The promise is pushed rather than awaited in the listener: an async listener has nowhere
      // to put a rejection, and throwing before entry.resume() below stalls the parser forever
      const archiveEntryPromise = (async (): Promise<ArchiveEntry<this>> => {
        let lastProgress = 0;
        try {
          const checksums = await FileChecksums.hashStream(
            // NOTE(cemmer): minipass is 99% stream.Stream-compatible, and I don't want to
            // introduce it and its types into the project just for this single line of code
            entry as unknown as stream.Readable,
            checksumBitmask,
            (progress) => {
              overallProgress = overallProgress - lastProgress + progress;
              if (callback) {
                callback(overallProgress);
              }
              lastProgress = progress;
            },
          );

          return await ArchiveEntry.entryOf(
            {
              archive: this,
              entryPath: entry.path,
              size: entry.size,
              ...checksums,
            },
            checksumBitmask,
          );
        } finally {
          // In case we didn't need to read the stream for hashes, resume the file reading
          entry.resume();
        }
      })();
      void archiveEntryPromise.catch(rejectParsed);
      archiveEntryPromises.push(archiveEntryPromise);
    });

    readStream.pipe(writeStream);

    try {
      await parsed;

      // Without `strict`, tar routes a recoverable problem to onwarn() above and never emits
      // 'error', so `parsed` resolves as if the archive were fine. Throwing the collected message
      // is what gets it to the caller.
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      return await Promise.all(archiveEntryPromises);
    } catch (error) {
      // abort() is what nerfs and destroys the parser's decompressor, whose zlib binding
      // readStream.destroy() below leaves open because pipe() doesn't propagate destroy()
      // downstream. It emits 'error', which the already-settled `parsed` above ignores.
      writeStream.abort(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      readStream.destroy();
    }
  }

  /**
   * Extract the named entry from the tar archive to the given file path.
   */
  async extractEntryToFile(
    { entryPath }: ArchiveEntryLocation,
    extractedFilePath: string,
  ): Promise<void> {
    await tar.extract(
      {
        file: this.getFilePath(),
        cwd: path.dirname(extractedFilePath),
        strict: true,
        filter: (_, stat) => {
          // @ts-expect-error the type is wrong: https://github.com/isaacs/node-tar/issues/357#issuecomment-1416806436
          stat.path = path.basename(extractedFilePath);
          return true;
        },
      },
      [entryPath.replaceAll('\\', '/')],
    );
    if (!(await FsUtil.exists(extractedFilePath))) {
      throw new IgirException(`didn't find extracted file '${entryPath}'`);
    }
  }
}
