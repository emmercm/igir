import fs from 'node:fs';
import path from 'node:path';
import stream, { Readable } from 'node:stream';
import util from 'node:util';

import async from 'async';
import { Mutex } from 'async-mutex';

import {
  CompressionMethod,
  TZValidator,
  TZWriter,
  ValidationResult,
  ValidationResultValue,
} from '../../../../packages/torrentzip/index.js';
import { CentralDirectoryFileHeader, ZipReader } from '../../../../packages/zip/index.js';
import { ProgressCallback } from '../../../console/progressBar.js';
import Defaults from '../../../globals/defaults.js';
import FsCopyTransform, { FsCopyCallback } from '../../../polyfill/fsCopyTransform.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import IgirException from '../../exceptions/igirException.js';
import { ZipFormat, ZipFormatValue } from '../../options.js';
import File from '../file.js';
import FileChecksums, { ChecksumBitmask, ChecksumProps } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

export default class Zip extends Archive {
  private readonly zipReader: ZipReader;

  private readonly tzValidateMutex = new Mutex();
  private tzValidateModifiedTimeMillis?: number;
  private tzValidateResult?: ValidationResultValue;

  constructor(filePath: string) {
    super(filePath);
    this.zipReader = new ZipReader(this.getFilePath());
  }

  protected new(filePath: string): Archive {
    return new Zip(filePath);
  }

  static getExtensions(): string[] {
    return ['.zip', '.zip64', '.apk', '.ipa', '.jar', '.pk3'];
  }

  getExtension(): string {
    return Zip.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    const entries = await this.zipReader.centralDirectoryFileHeaders();

    return async.mapLimit(
      entries.filter((entry) => !entry.isDirectory()),
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (entryFile: CentralDirectoryFileHeader): Promise<ArchiveEntry<this>> => {
        let checksums: ChecksumProps = {};
        if (checksumBitmask & ~ChecksumBitmask.CRC32) {
          const entryStream = await entryFile.uncompressedStream(Defaults.FILE_READING_CHUNK_SIZE);
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
            entryPath: entryFile.fileNameResolved(),
            size: entryFile.uncompressedSizeResolved(),
            crc32: crc32 ?? entryFile.uncompressedCrc32String(),
            ...checksumsWithoutCrc,
          },
          checksumBitmask,
        );
      },
    );
  }

  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
    callback?: FsCopyCallback,
  ): Promise<void> {
    const extractedDir = path.dirname(extractedFilePath);
    if (!(await FsPoly.exists(extractedDir))) {
      await FsPoly.mkdir(extractedDir, { recursive: true });
    }

    return this.extractEntryToStream(entryPath, async (readable) => {
      await util.promisify(stream.pipeline)(
        readable,
        new FsCopyTransform(callback),
        fs.createWriteStream(extractedFilePath),
      );
    });
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

    // TODO(cemmer): hold a reference to the CentralDirectoryFileHeader so we don't have to parse
    const entries = await this.zipReader.centralDirectoryFileHeaders();
    const entry = entries.find(
      (entryFile) =>
        entryFile.fileNameResolved().replaceAll(/[\\/]/g, '/') ===
        entryPath.replaceAll(/[\\/]/g, '/'),
    );
    if (!entry) {
      // This should never happen, this likely means the zip file was modified after scanning
      throw new IgirException(`didn't find entry '${entryPath}'`);
    }

    let entryStream: stream.Readable;
    try {
      entryStream = await entry.uncompressedStream(Defaults.FILE_READING_CHUNK_SIZE);
    } catch (error) {
      throw new Error(`failed to read '${this.getFilePath()}|${entryPath}': ${error}`);
    }

    try {
      return await callback(entryStream);
    } finally {
      entryStream.destroy();
    }
  }

  async createArchive(
    inputToOutput: [File, ArchiveEntry<Zip>][],
    zipFormat: ZipFormatValue,
    compressorThreads: number,
    callback?: ProgressCallback,
  ): Promise<void> {
    // Pipe the zip contents to disk, using an intermediate temp file because we may be trying to
    // overwrite an input zip file
    const tempZipFile = await FsPoly.mktemp(this.getFilePath());
    const torrentZip = await TZWriter.open(
      tempZipFile,
      zipFormat === ZipFormat.RVZSTD ? CompressionMethod.ZSTD : CompressionMethod.DEFLATE,
    );

    try {
      await Zip.addArchiveEntries(torrentZip, inputToOutput, compressorThreads, callback);
      await torrentZip.finalize();
      await FsPoly.mv(tempZipFile, this.getFilePath());
    } finally {
      await torrentZip.close();
      await FsPoly.rm(tempZipFile, { force: true });
    }
  }

  private static async addArchiveEntries(
    torrentZip: TZWriter,
    inputToOutput: [File, ArchiveEntry<Zip>][],
    compressorThreads: number,
    callback?: ProgressCallback,
  ): Promise<void> {
    // TZWriter needs files to be sorted by lowercase
    const inputToOutputSorted = inputToOutput.sort(([, outputA], [, outputB]) => {
      const pathLowerA = outputA.getEntryPath().toLowerCase();
      const pathLowerB = outputB.getEntryPath().toLowerCase();
      if (pathLowerA < pathLowerB) {
        return -1;
      } else if (pathLowerA > pathLowerB) {
        return 1;
      }
      return 0;
    });

    let sizeWritten = 0;
    const sizeTotal = inputToOutputSorted.reduce((sum, [, output]) => sum + output.getSize(), 0);

    for (const [inputFile, outputArchiveEntry] of inputToOutputSorted) {
      // TZWriter requires files to be compressed sequentially
      try {
        let lastProgress = 0;
        await new Promise((resolve, reject) => {
          inputFile
            .createPatchedReadStream(async (readable) => {
              readable.on('error', reject);
              await torrentZip.addStream(
                readable,
                outputArchiveEntry.getEntryPath().replaceAll(/[\\/]/g, '/'),
                inputFile.getSize(),
                compressorThreads,
                (progress) => {
                  if (!callback) {
                    return;
                  }
                  lastProgress = progress;
                  callback(sizeWritten + progress, sizeTotal);
                },
              );
            })
            .then(resolve)
            .catch(reject);
        });
        sizeWritten += lastProgress;
      } catch (error) {
        throw new Error(
          `failed to write '${inputFile.toString()}' to '${outputArchiveEntry.toString()}': ${error}`,
        );
      }
    }
  }

  async isTorrentZip(): Promise<boolean> {
    try {
      return (await this.tzValidate()) === ValidationResult.VALID_TORRENTZIP;
    } catch {
      // Likely a zip reading failure
      return false;
    }
  }

  async isRVZSTD(): Promise<boolean> {
    try {
      return (await this.tzValidate()) === ValidationResult.VALID_RVZSTD;
    } catch {
      // Likely a zip reading failure
      return false;
    }
  }

  /**
   * Cache TZValidator results as long as this file hasn't been modified.
   */
  private async tzValidate(): Promise<ValidationResultValue> {
    return this.tzValidateMutex.runExclusive(async () => {
      const modifiedTimeMillis = (await FsPoly.stat(this.getFilePath())).mtimeMs;
      if (
        this.tzValidateResult !== undefined &&
        modifiedTimeMillis === this.tzValidateModifiedTimeMillis
      ) {
        return this.tzValidateResult;
      }

      this.tzValidateResult = await TZValidator.validate(this.zipReader);
      this.tzValidateModifiedTimeMillis = modifiedTimeMillis;
      return this.tzValidateResult;
    });
  }
}
