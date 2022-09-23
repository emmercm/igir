import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { clearInterval } from 'timers';
import yauzl, { Entry } from 'yauzl';
import yazl from 'yazl';

import fsPoly from '../../polyfill/fsPoly.js';
import ArchiveEntry from '../files/archiveEntry.js';
import File from '../files/file.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  getArchiveEntries(): Promise<ArchiveEntry<Zip>[]> {
    return new Promise((resolve, reject) => {
      yauzl.open(this.getFilePath(), {
        lazyEntries: true,
      }, (fileErr, zipFile) => {
        if (fileErr) {
          reject(fileErr);
          return;
        }

        const archiveEntries: ArchiveEntry<Zip>[] = [];

        zipFile.on('entry', (entry: Entry) => {
          if (!entry.fileName.endsWith('/')) {
            // Is a file
            archiveEntries.push(new ArchiveEntry(
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
      });
    });
  }

  async extractEntryToFile<T>(
    archiveEntry: ArchiveEntry<Zip>,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath());

    return this.extractEntryToStream(
      archiveEntry,
      tempDir,
      (readStream) => new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(localFile);
        writeStream.on('close', async () => {
          try {
            return resolve(await callback(localFile));
          } catch (callbackErr) {
            return reject(callbackErr);
          }
        });
        readStream.pipe(writeStream);
      }),
    );
  }

  async extractEntryToStream<T>(
    archiveEntry: ArchiveEntry<Zip>,
    tempDir: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      yauzl.open(this.getFilePath(), {
        lazyEntries: true,
      }, (fileErr, zipFile) => {
        if (fileErr) {
          reject(fileErr);
          return;
        }

        zipFile.on('entry', (entry: Entry) => {
          if (entry.fileName === archiveEntry.getEntryPath()) {
            // Found the file we're looking for
            zipFile.openReadStream(entry, async (streamErr, stream) => {
              if (streamErr) {
                return reject(streamErr);
              }

              try {
                return resolve(await callback(stream));
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
      });
    });
  }

  // TODO(cemmer): find a better way to do this with more async/await
  async archiveEntries(inputToOutput: Map<File, ArchiveEntry<Zip>>): Promise<undefined> {
    return new Promise((resolve, reject) => {
      const zipFile = new yazl.ZipFile();

      // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
      // overwrite an input zip file
      const tempZipFile = fsPoly.mktempSync(this.getFilePath());
      const writeStream = fs.createWriteStream(tempZipFile);
      writeStream.on('close', () => {
        try {
          fs.renameSync(tempZipFile, this.getFilePath()); // overwrites
          resolve(undefined);
        } catch (e) {
          reject(e);
        }
      });
      writeStream.on('error', (err) => reject(err));
      zipFile.outputStream.pipe(writeStream);

      // Promise that resolves when we're done writing the zip
      const zipClosed = new Promise((resolveClosed) => {
        const interval = setInterval(() => {
          if (!writeStream.writable) {
            clearInterval(interval);
            resolveClosed(undefined);
          }
        }, 10);
      });

      // Start writing the zip when all entries have been enqueued
      let zipEntriesQueued = 0;
      new Promise((resolveQueued) => {
        const interval = setInterval(() => {
          if (zipEntriesQueued === inputToOutput.size) {
            clearInterval(interval);
            resolveQueued(undefined);
          }
        });
      })
        .then(() => zipFile.end())
        .catch((err) => reject(err));

      // Enqueue all archive entries to the zip
      [...inputToOutput.entries()]
        .forEach(([inputFile, outputArchiveEntry]) => inputFile
          .extractToStream(async (readStream) => {
            zipFile.addReadStream(readStream, outputArchiveEntry.getEntryPath());
            zipEntriesQueued += 1;

            // Leave the stream open until we're done writing the zip
            await zipClosed;
          }));
    });
  }
}
