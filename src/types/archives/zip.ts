import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { clearInterval } from 'timers';
import yauzl, { Entry } from 'yauzl';
import yazl from 'yazl';

import fsPoly from '../../polyfill/fsPoly.js';
import ArchiveEntry from '../files/archiveEntry.js';
import File from '../files/file.js';
import Options from '../options.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  async getArchiveEntries(): Promise<ArchiveEntry<Zip>[]> {
    return new Promise((resolve, reject) => {
      yauzl.open(this.getFilePath(), {
        lazyEntries: true,
      }, (fileErr, zipFile) => {
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
      });
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
      await fsPromises.mkdir(localDir);
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
      yauzl.open(this.getFilePath(), {
        lazyEntries: true,
      }, (fileErr, zipFile) => {
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
      });
    });
  }

  async archiveEntries(
    options: Options,
    inputToOutput: Map<File, ArchiveEntry<Zip>>,
  ): Promise<void> {
    const zipFile = new yazl.ZipFile();

    // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
    // overwrite an input zip file
    const tempZipFile = fsPoly.mktempSync(this.getFilePath());
    const writeStream = fs.createWriteStream(tempZipFile);
    zipFile.outputStream.pipe(writeStream);

    // Promise that resolves when we're done writing the zip
    const zipClosed = new Promise<void>((resolve, reject) => {
      writeStream.on('close', () => resolve());
      writeStream.on('error', (err) => reject(err));
    });

    // Enqueue all archive entries to the zip
    let zipEntriesQueued = 0;
    const inputStreams = [...inputToOutput.entries()]
      .map(async ([inputFile, outputArchiveEntry]) => inputFile
        .extractToStream(async (readStream) => {
          zipFile.addReadStream(readStream, outputArchiveEntry.getEntryPath());
          zipEntriesQueued += 1;

          // Leave the stream open until we're done writing the zip
          await zipClosed;
        }, options.canRemoveHeader(path.extname(inputFile.getExtractedFilePath()))));

    // Wait until all archive entries have been enqueued
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (zipEntriesQueued === inputToOutput.size) {
          clearInterval(interval);
          resolve();
        }
      });
    });

    // Start writing the zip file
    zipFile.end();

    // Wait until we've closed the input streams
    await Promise.all(inputStreams);

    await fsPromises.rename(tempZipFile, this.getFilePath()); // overwrites

    // Wait until the file was actually renamed
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (fs.existsSync(this.getFilePath())) {
          clearInterval(interval);
          resolve();
        }
      });
    });
  }
}
