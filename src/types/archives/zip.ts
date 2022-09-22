import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import yauzl, { Entry } from 'yauzl';
import yazl from 'yazl';

import ArchiveEntry from '../files/archiveEntry.js';
import File from '../files/file.js';
import Archive from './archive.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  getArchiveEntries(): Promise<ArchiveEntry[]> {
    return new Promise((resolve, reject) => {
      yauzl.open(this.getFilePath(), {
        lazyEntries: true,
      }, (fileErr, zipFile) => {
        if (fileErr) {
          reject(fileErr);
          return;
        }

        const archiveEntries: ArchiveEntry[] = [];

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
    archiveEntry: ArchiveEntry,
    tempDir: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, archiveEntry.getEntryPath());

    return this.extractEntryToStream(
      archiveEntry,
      tempDir,
      (readStream) => new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(localFile);
        writeStream.on('close', () => {
          try {
            return resolve(callback(localFile));
          } catch (callbackErr) {
            return reject(callbackErr);
          }
        });
        readStream.pipe(writeStream);
      }),
    );
  }

  async extractEntryToStream<T>(
    archiveEntry: ArchiveEntry,
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
                return resolve(callback(stream));
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

  async archiveEntries(inputToOutput: Map<File, ArchiveEntry>): Promise<undefined> {
    return new Promise((resolve, reject) => {
      const zipFile = new yazl.ZipFile();

      // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
      // overwrite an input zip file
      const tempZipFile = `${this.getFilePath()}.temp`;
      const writeStream = fs.createWriteStream(tempZipFile);
      writeStream.on('close', () => {
        fs.renameSync(tempZipFile, this.getFilePath()); // overwrites
        resolve(undefined);
      });
      writeStream.on('error', (err) => reject(err));
      zipFile.outputStream.pipe(writeStream);

      // Add all archive entries to the zip
      Promise.all(
        [...inputToOutput.entries()].map(([inputFile, outputArchiveEntry]) => inputFile
          .extractToStream((readStream) => {
            zipFile.addReadStream(readStream, outputArchiveEntry.getEntryPath());
          })),
      )
        .then(() => zipFile.end())
        .catch((err) => reject(err));
    });
  }
}
