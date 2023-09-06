import archiver, { Archiver } from 'archiver';
import async from 'async';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { clearInterval } from 'timers';
import { Memoize } from 'typescript-memoize';
import unzipper from 'unzipper';

import Constants from '../../../constants.js';
import fsPoly from '../../../polyfill/fsPoly.js';
import DAT from '../../dats/dat.js';
import Options from '../../options.js';
import File from '../file.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class Zip extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.zip'];

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Zip(filePath);
  }

  @Memoize()
  async getArchiveEntries(): Promise<ArchiveEntry<Zip>[]> {
    // https://github.com/ZJONSSON/node-unzipper/issues/280
    // UTF-8 entry names are not decoded correctly
    // But this is mitigated by `extractEntryToStream()` and therefore `extractEntryToFile()` both
    //  using `unzipper.Open.file()` as well, so mangled filenames here will still extract fine
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

  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
    const localDir = path.dirname(extractedFilePath);
    if (!await fsPoly.exists(localDir)) {
      await fsPoly.mkdir(localDir, { recursive: true });
    }

    return this.extractEntryToStream(
      entryPath,
      async (stream) => new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(extractedFilePath);
        writeStream.on('close', resolve);
        writeStream.on('error', reject);
        stream.pipe(writeStream);
      }),
    );
  }

  async extractEntryToStream<T>(
    entryPath: string,
    callback: (stream: Readable) => (Promise<T> | T),
  ): Promise<T> {
    const archive = await unzipper.Open.file(this.getFilePath());

    const entry = archive.files
      .filter((entryFile) => entryFile.type === 'File')
      .filter((entryFile) => entryFile.path === entryPath.replace(/[\\/]/g, '/'))[0];
    if (!entry) {
      throw new Error(`didn't find entry '${entryPath}'`);
    }

    const stream = entry.stream();
    try {
      return await callback(stream);
    } finally {
      /**
       * In the case the callback doesn't read the entire stream, {@link unzipper} will leave the
       * file handle open. Drain the stream so the file handle can be released. The stream cannot
       * be destroyed by the callback, or this will never resolve!
       */
      await new Promise((resolve) => { stream.end(resolve); });
    }
  }

  async createArchive(
    options: Options,
    dat: DAT,
    inputToOutput: [File, ArchiveEntry<Zip>][],
  ): Promise<void> {
    // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
    // overwrite an input zip file
    const tempZipFile = await fsPoly.mktemp(this.getFilePath());
    const writeStream = fs.createWriteStream(tempZipFile);

    // Start writing the zip file
    const zipFile = archiver('zip', {
      highWaterMark: Constants.FILE_READING_CHUNK_SIZE,
      zlib: {
        chunkSize: 256 * 1024, // 256KiB buffer to/from zlib, defaults to 16KiB
        level: 9,
        memLevel: 9, // history buffer size, max, defaults to 8
      },
    });
    zipFile.pipe(writeStream);

    // Write each entry
    try {
      await Zip.addArchiveEntries(zipFile, options, dat, inputToOutput);
    } catch (e) {
      zipFile.abort();
      await fsPoly.rm(tempZipFile, { force: true });
      throw e;
    }

    // Finalize writing the zip file
    await zipFile.finalize();
    await new Promise((resolve) => {
      writeStream.on('close', resolve);
    });

    await fsPoly.mv(tempZipFile, this.getFilePath());
  }

  private static async addArchiveEntries(
    zipFile: Archiver,
    options: Options,
    dat: DAT,
    inputToOutput: [File, ArchiveEntry<Zip>][],
  ): Promise<void> {
    let zipFileError: Error | undefined;
    const catchError = (err: Error): void => {
      zipFileError = err;
    };
    zipFile.on('error', catchError);

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
      async.asyncify(async (
        [inputFile, outputArchiveEntry]: [File, ArchiveEntry<Zip>],
      ): Promise<void> => {
        const removeHeader = options.canRemoveHeader(
          dat,
          path.extname(inputFile.getExtractedFilePath()),
        );

        return inputFile.createPatchedReadStream(removeHeader, async (stream) => {
          // Catch stream errors such as `ENOENT: no such file or directory`
          stream.on('error', catchError);

          const entryName = outputArchiveEntry.getEntryPath().replace(/[\\/]/g, '/');
          zipFile.append(stream, {
            name: entryName,
          });

          // Leave the input stream open until we're done writing it
          await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              if (writtenEntries.has(entryName) || zipFileError) {
                clearInterval(interval);
                resolve();
              }
            }, 10);
          });
        });
      }),
    );

    if (zipFileError) {
      throw zipFileError;
    }
  }
}
