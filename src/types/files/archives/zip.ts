import fs from 'node:fs';
import path from 'node:path';
import stream, { Readable } from 'node:stream';

import archiver, { Archiver } from 'archiver';
import async from 'async';

import Defaults from '../../../globals/defaults.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import Timer from '../../../timer.js';
import ExpectedError from '../../expectedError.js';
import File from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';
import BananaSplit from './zip/bananaSplit/bananaSplit.js';
import CentralDirectoryFileHeader from './zip/bananaSplit/centralDirectoryFileHeader.js';

export default class Zip extends Archive {
  protected new(filePath: string): Archive {
    return new Zip(filePath);
  }

  static getExtensions(): string[] {
    return ['.zip', '.apk', '.ipa', '.jar', '.pk3'];
  }

  getExtension(): string {
    return Zip.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    const archive = new BananaSplit(this.getFilePath());
    const entries = await archive.entries();

    return async.mapLimit(
      entries.filter((entry) => !entry.isDirectory()),
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (entryFile: CentralDirectoryFileHeader): Promise<ArchiveEntry<this>> => {
        let checksums: ChecksumProps = {};
        if (checksumBitmask & ~ChecksumBitmask.CRC32) {
          const entryStream = await entryFile.uncompressedStream();
          try {
            checksums = await FileChecksums.hashStream(entryStream, checksumBitmask);
          } finally {
            entryStream.destroy();
          }
        }
        const { crc32, ...checksumsWithoutCrc } = checksums;

        return ArchiveEntry.entryOf(
          {
            archive: this,
            entryPath: entryFile.fileName,
            size: entryFile.uncompressedSize,
            crc32: crc32 ?? entryFile.uncompressedCrc32,
            ...checksumsWithoutCrc,
          },
          checksumBitmask,
        );
      },
    );
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    const extractedDir = path.dirname(extractedFilePath);
    if (!(await FsPoly.exists(extractedDir))) {
      await FsPoly.mkdir(extractedDir, { recursive: true });
    }

    return this.extractEntryToStream(
      entryPath,
      async (stream) =>
        new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(extractedFilePath);
          writeStream.on('close', resolve);
          writeStream.on('error', reject);
          stream.pipe(writeStream);
        }),
    );
  }

  async extractEntryToStream<T>(
    entryPath: string,
    callback: (stream: Readable) => Promise<T> | T,
    start = 0,
  ): Promise<T> {
    if (start > 0) {
      // Can't start the stream at an uncompressed offset
      return super.extractEntryToStream(entryPath, callback, start);
    }

    const archive = new BananaSplit(this.getFilePath());
    const entries = await archive.entries();
    const entry = entries.find(
      (entryFile) =>
        entryFile.fileName.replaceAll(/[\\/]/g, '/') === entryPath.replaceAll(/[\\/]/g, '/'),
    );
    if (!entry) {
      // This should never happen, this likely means the zip file was modified after scanning
      throw new ExpectedError(`didn't find entry '${entryPath}'`);
    }

    let entryStream: stream.Readable;
    try {
      entryStream = await entry.uncompressedStream();
    } catch (error) {
      throw new Error(`failed to read '${this.getFilePath()}|${entryPath}': ${error}`);
    }

    try {
      return await callback(entryStream);
    } finally {
      entryStream.destroy();
    }
  }

  async createArchive(inputToOutput: [File, ArchiveEntry<Zip>][]): Promise<void> {
    // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
    // overwrite an input zip file
    const tempZipFile = await FsPoly.mktemp(this.getFilePath());
    const writeStream = fs.createWriteStream(tempZipFile);

    // Start writing the zip file
    const zipFile = archiver('zip', {
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
      zlib: {
        chunkSize: 256 * 1024, // 256KiB buffer to/from zlib, defaults to 16KiB
        level: 9,
        memLevel: 9, // history buffer size, max, defaults to 8
      },
    });
    zipFile.pipe(writeStream);

    // Write each entry
    try {
      await Zip.addArchiveEntries(zipFile, inputToOutput);
    } catch (error) {
      zipFile.abort();
      await FsPoly.rm(tempZipFile, { force: true });
      throw error;
    }

    // Finalize writing the zip file
    await zipFile.finalize();
    await new Promise<void>((resolve) => {
      // We are writing to a file, so we want to wait on the 'close' event which indicates the file
      // descriptor has been closed. 'finished' will also fire before 'close' does.
      writeStream.on('close', resolve);
    });

    await FsPoly.mv(tempZipFile, this.getFilePath());
  }

  private static async addArchiveEntries(
    zipFile: Archiver,
    inputToOutput: [File, ArchiveEntry<Zip>][],
  ): Promise<void> {
    let zipFileError: Error | undefined;
    const catchError = (err: Error): void => {
      zipFileError = err;
    };
    zipFile.on('error', catchError);
    zipFile.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        catchError(err);
      }
    });

    // Keep track of what entries have been written to the temp file on disk
    const writtenEntries = new Set<string>();
    zipFile.on('entry', (entry) => {
      writtenEntries.add(entry.name);
    });

    // Write all archive entries to the zip
    await async.eachLimit(
      inputToOutput,
      /**
       * {@link archiver} uses a sequential, async queue internally:
       * @see https://github.com/archiverjs/node-archiver/blob/b5cc14cc97cc64bdca32c0cbe9d660b5b979be7c/lib/core.js#L52
       * Because of that, we should/can limit the number of open input file handles open. But we
       *  also want to make sure the queue processing stays busy. Use 3 as a middle-ground.
       */
      3,
      async ([inputFile, outputArchiveEntry]: [File, ArchiveEntry<Zip>]): Promise<void> => {
        const streamProcessor = async (stream: Readable): Promise<void> => {
          // Catch stream errors such as `ENOENT: no such file or directory`
          stream.on('error', catchError);

          const entryName = outputArchiveEntry.getEntryPath().replaceAll(/[\\/]/g, '/');
          zipFile.append(stream, {
            name: entryName,
          });

          // Leave the input stream open until we're done writing it
          await new Promise<void>((resolve) => {
            const timer = Timer.setInterval(() => {
              if (writtenEntries.has(entryName) || zipFileError) {
                timer.cancel();
                resolve();
              }
            }, 10);
          });
        };

        try {
          await inputFile.createPatchedReadStream(streamProcessor);
        } catch (error) {
          // Reading the file can throw an exception, so we have to handle that or this will hang
          if (error instanceof Error) {
            catchError(error);
          } else if (typeof error === 'string') {
            catchError(new Error(error));
          } else {
            catchError(
              new Error(
                `failed to write '${inputFile.toString()}' to '${outputArchiveEntry.toString()}'`,
              ),
            );
          }
        }
      },
    );

    if (zipFileError) {
      throw zipFileError;
    }
  }
}
