import archiver from 'archiver';
import async from 'async';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { clearInterval } from 'timers';
import util from 'util';
import yauzl, { Entry, ZipFile } from 'yauzl';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import ArchiveEntry from '../files/archiveEntry.js';
import File from '../files/file.js';
import DAT from '../logiqx/dat.js';
import Options from '../options.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Zip(filePath);
  }

  async getArchiveEntries(): Promise<ArchiveEntry<Zip>[]> {
    return new Promise((resolve, reject) => {
      const yauzlCallback = (fileErr: Error | null, zipFile: ZipFile): void => {
        if (fileErr) {
          reject(fileErr);
          return;
        }

        const archiveEntries: ArchiveEntry<Zip>[] = [];

        zipFile.on('entry', async (entry: Entry) => {
          if (!entry.fileName.endsWith('/')) {
            // Is a file
            archiveEntries.push(await ArchiveEntry.entryOf(
              this,
              entry.fileName,
              entry.uncompressedSize,
              entry.crc32.toString(16),
            ));
          }

          // Continue
          zipFile.readEntry();
        });

        zipFile.on('close', () => resolve(archiveEntries));

        zipFile.on('error', (err) => reject(err));

        // Start
        zipFile.readEntry();
      };

      try {
        yauzl.open(this.getFilePath(), {
          lazyEntries: true,
        }, yauzlCallback);
      } catch (e) {
        reject(e);
      }
    });
  }

  async extractEntryToFile<T>(
    entryPath: string,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, entryPath);

    const localDir = path.dirname(localFile);
    if (!await fsPoly.exists(localDir)) {
      await util.promisify(fs.mkdir)(localDir, { recursive: true });
    }

    return this.extractEntryToStream(
      entryPath,
      tempDir,
      async (readStream) => new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(localFile);
        writeStream.on('close', async () => {
          try {
            return resolve(await callback(localFile));
          } catch (callbackErr) {
            return reject(callbackErr);
          }
        });
        writeStream.on('error', (err) => reject(err));
        readStream.pipe(writeStream);
      }),
    );
  }

  async extractEntryToStream<T>(
    entryPath: string,
    tempDir: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const yauzlCallback = (fileErr: Error | null, zipFile: ZipFile): void => {
        if (fileErr) {
          reject(fileErr);
          return;
        }

        zipFile.on('entry', (entry: Entry) => {
          if (entry.fileName === entryPath.replace(/[\\/]/g, '/')) {
            // Found the file we're looking for
            zipFile.openReadStream(entry, async (streamErr, stream) => {
              if (streamErr) {
                return reject(streamErr);
              }

              try {
                const result = await callback(stream);
                stream.destroy();
                zipFile.close();
                return resolve(result);
              } catch (callbackErr) {
                return reject(callbackErr);
              }
            });
          } else {
            // Continue until we find what we're looking for
            zipFile.readEntry();
          }
        });

        zipFile.on('error', (err) => reject(err));

        // Start
        zipFile.readEntry();
      };

      try {
        yauzl.open(this.getFilePath(), {
          lazyEntries: true,
        }, yauzlCallback);
      } catch (e) {
        reject(e);
      }
    });
  }

  async archiveEntries(
    options: Options,
    dat: DAT,
    inputToOutput: Map<File, ArchiveEntry<Zip>>,
  ): Promise<void> {
    // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
    // overwrite an input zip file
    const tempZipFile = await fsPoly.mktemp(this.getFilePath());
    const writeStream = fs.createWriteStream(tempZipFile);

    const zipFile = archiver('zip', {
      highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      zlib: {
        chunkSize: 256 * 1024, // buffer to/from zlib, defaults to 16KiB
        level: 9,
        memLevel: 9, // history buffer size, max, defaults to 8
      },
    });
    zipFile.on('error', (err) => {
      zipFile.abort();
      throw err;
    });

    // Keep track of what entries have been written to the temp file on disk
    const writtenEntries = new Map<string, boolean>();
    zipFile.on('entry', (entry) => {
      writtenEntries.set(entry.name, true);
    });

    zipFile.pipe(writeStream);

    console.log(`${tempZipFile}: enqueuing`);

    // Write all archive entries to the zip
    await async.eachLimit(
      [...inputToOutput.entries()],
      /**
       * `archiver` uses a sequential, async queue internally:
       * @link https://github.com/archiverjs/node-archiver/blob/b5cc14cc97cc64bdca32c0cbe9d660b5b979be7c/lib/core.js#L52
       * Because of that, we should/can limit the number of open input file handles open. But we
       *  also want to make sure the queue processing stays busy.
       */
      3,
      async ([inputFile, outputArchiveEntry], callback) => {
        console.log(`${inputFile.toString()}: extracting`);
        return inputFile
          .extractToStream(async (readStream) => {
            console.log(`${outputArchiveEntry.toString()}: compressing`);

            const entryName = outputArchiveEntry.getEntryPath().replace(/[\\/]/g, '/');
            zipFile.append(readStream, {
              name: entryName,
            });

            // Leave the input stream open until we're done writing it
            await new Promise<void>((resolve) => {
              const interval = setInterval(() => {
                if (writtenEntries.has(entryName)) {
                  clearInterval(interval);
                  resolve();
                }
              }, 10);
            });
            callback();
          }, options.canRemoveHeader(dat, path.extname(inputFile.getExtractedFilePath())));
      },
    );

    // Finalize writing the zip file
    await zipFile.finalize();

    // TODO(cemmer): something?

    await fsPoly.rename(tempZipFile, this.getFilePath());
  }
}
