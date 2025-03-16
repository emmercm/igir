import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import archiver, { Archiver } from 'archiver';
import async from 'async';
import yauzl, { Entry } from 'yauzl';

import Defaults from '../../../globals/defaults.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import Timer from '../../../timer.js';
import ExpectedError from '../../expectedError.js';
import File from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

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
    const entries: ArchiveEntry<this>[] = [];
    await new Promise<void>((resolve, reject) => {
      yauzl.open(
        this.getFilePath(),
        { autoClose: true, lazyEntries: true },
        (zipError, zipFile) => {
          if (zipError) {
            reject(zipError);
            return;
          }

          zipFile.readEntry(); // read first entry
          zipFile.on('entry', async (entryFile: Entry) => {
            if (entryFile.fileName.endsWith('/')) {
              // Is a directory
              return zipFile.readEntry(); // continue reading the next entry
            }

            if (entryFile.compressionMethod === 12) {
              reject(new ExpectedError("BZip2 isn't supported for .zip files"));
              return zipFile.close();
            }
            if (entryFile.compressionMethod === 14) {
              reject(new ExpectedError("LZMA isn't supported for .zip files"));
              return zipFile.close();
            }
            if (entryFile.compressionMethod === 20 || entryFile.compressionMethod === 93) {
              reject(new ExpectedError("Zstandard isn't supported for .zip files"));
              return zipFile.close();
            }
            if (entryFile.compressionMethod === 98) {
              reject(new ExpectedError("PPMd isn't supported for .zip files"));
              return zipFile.close();
            }
            if (entryFile.compressionMethod !== 0 && entryFile.compressionMethod !== 8) {
              reject(
                new ExpectedError('only STORE and DEFLATE methods are supported for .zip files'),
              );
              return zipFile.close();
            }

            let checksums: ChecksumProps = {};
            if (checksumBitmask & ~ChecksumBitmask.CRC32) {
              await new Promise<void>((entryResolve) => {
                zipFile.openReadStream(entryFile, async (entryError, entryStream) => {
                  if (entryError) {
                    reject(entryError);
                    zipFile.close();
                    return;
                  }
                  entryStream.on('error', (error) => {
                    reject(error);
                    zipFile.close();
                  });

                  try {
                    checksums = await FileChecksums.hashStream(entryStream, checksumBitmask);
                  } catch (error) {
                    if (error instanceof Error) {
                      reject(error);
                    } else if (typeof error === 'string') {
                      reject(new Error(error));
                    } else {
                      reject(
                        new Error(`failed to hash ${this.getFilePath()}|${entryFile.fileName}`),
                      );
                    }
                    zipFile.close();
                  } finally {
                    entryStream.destroy();
                    entryResolve();
                  }
                });
              });
            }
            const { crc32, ...checksumsWithoutCrc } = checksums;

            try {
              const archiveEntry = await ArchiveEntry.entryOf(
                {
                  archive: this,
                  entryPath: entryFile.fileName,
                  size: entryFile.uncompressedSize,
                  crc32: crc32 ?? entryFile.crc32.toString(16),
                  ...checksumsWithoutCrc,
                },
                checksumBitmask,
              );
              entries.push(archiveEntry);
            } catch (error) {
              if (error instanceof Error) {
                reject(error);
              } else if (typeof error === 'string') {
                reject(new Error(error));
              } else {
                reject(
                  new Error(`failed to make entry of ${this.getFilePath()}|${entryFile.fileName}`),
                );
              }
              zipFile.close();
            } finally {
              zipFile.readEntry(); // continue reading the next entry
            }
          });

          zipFile.on('error', reject);
          zipFile.on('close', resolve);
        },
      );
    });
    return entries;
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
      // Zip library doesn't support starting the stream at some offset
      return super.extractEntryToStream(entryPath, callback, start);
    }

    return new Promise((resolve, reject) => {
      yauzl.open(
        this.getFilePath(),
        { autoClose: true, lazyEntries: true },
        (zipError, zipFile) => {
          if (zipError) {
            reject(zipError);
            return;
          }

          let result: T;
          let foundEntry = false;
          zipFile.readEntry(); // read first entry
          zipFile.on('entry', (entryFile: Entry) => {
            if (entryFile.fileName !== entryPath.replace(/[\\/]/g, '/')) {
              zipFile.readEntry(); // continue reading the next entry
              return;
            }

            zipFile.openReadStream(entryFile, async (entryError, entryStream) => {
              if (entryError) {
                reject(entryError);
                return;
              }
              entryStream.on('error', reject);

              try {
                result = await callback(entryStream);
                foundEntry = true;
              } catch (error) {
                if (error instanceof Error) {
                  reject(error);
                } else if (typeof error === 'string') {
                  reject(new Error(error));
                } else {
                  reject(
                    new Error(`failed to extract ${this.getFilePath()}|${entryFile.fileName}`),
                  );
                }
              } finally {
                entryStream.destroy();
                zipFile.readEntry(); // continue reading the next entry
              }
            });
          });

          zipFile.on('error', reject);
          zipFile.on('close', () => {
            if (foundEntry) {
              resolve(result);
            } else {
              // This should never happen, this likely means the zip file was modified after scanning
              reject(new Error(`didn't find entry '${entryPath}'`));
            }
          });
        },
      );
    });
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

    return FsPoly.mv(tempZipFile, this.getFilePath());
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

          const entryName = outputArchiveEntry.getEntryPath().replace(/[\\/]/g, '/');
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
