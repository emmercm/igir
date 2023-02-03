import archiver from 'archiver';
import async from 'async';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { clearInterval } from 'timers';
import unzipper from 'unzipper';
import util from 'util';

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
    const archive = await unzipper.Open.file(this.getFilePath());

    return Promise.all(archive.files
      .filter((entryFile) => entryFile.type === 'File')
      .map(async (entryFile) => ArchiveEntry.entryOf(
        this,
        entryFile.path,
        entryFile.uncompressedSize,
        entryFile.crc32.toString(16),
      )));
  }

  async extractEntryToFile<T>(
    entryPath: string,
    extractedFilePath: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const localFile = path.join(tempDir, entryPath);

    const localDir = path.dirname(localFile);
    if (!await fsPoly.exists(localDir)) {
      await util.promisify(fs.mkdir)(localDir, { recursive: true });
    }

    // TODO(cemmer): don't do this? Zip.extractEntryToStream doesn't actually need a tempDir
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
    const archive = await unzipper.Open.file(this.getFilePath());

    const entry = archive.files
      .filter((entryFile) => entryFile.type === 'File')
      .filter((entryFile) => entryFile.path === entryPath.replace(/[\\/]/g, '/'))[0];
    if (!entry) {
      throw new Error(`Didn't find entry '${entryPath}'`);
    }

    return callback(entry.stream());
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

    // Write all archive entries to the zip
    await async.eachLimit(
      [...inputToOutput.entries()],
      /**
       * {@link archiver} uses a sequential, async queue internally:
       * @link https://github.com/archiverjs/node-archiver/blob/b5cc14cc97cc64bdca32c0cbe9d660b5b979be7c/lib/core.js#L52
       * Because of that, we should/can limit the number of open input file handles open. But we
       *  also want to make sure the queue processing stays busy.
       */
      3,
      async ([inputFile, outputArchiveEntry], callback) => inputFile
        .extractToStream(async (readStream) => {
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
        }, options.canRemoveHeader(dat, path.extname(inputFile.getExtractedFilePath()))),
    );

    // Finalize writing the zip file
    await zipFile.finalize();

    await fsPoly.rename(tempZipFile, this.getFilePath());
  }
}
