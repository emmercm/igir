import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import util from 'node:util';

import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, ChdmanBinaryPreference, CHDType } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import ExpectedError from '../../../expectedError.js';
import File from '../../file.js';
import { ChecksumBitmask, ChecksumBitmaskValue } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import ChdBinCueParser from './chdBinCueParser.js';
import ChdGdiParser from './chdGdiParser.js';

export default class Chd extends Archive {
  private tempSingletonHandles = 0;

  private readonly tempSingletonMutex = new Mutex();

  private tempSingletonDirPath?: string;

  private tempSingletonFilePath?: string;

  protected new(filePath: string): Archive {
    return new Chd(filePath);
  }

  static getExtensions(): string[] {
    return ['.chd'];
  }

  getExtension(): string {
    return Chd.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: ChecksumBitmaskValue): Promise<ArchiveEntry<this>[]> {
    const info = await this.getInfo();

    if (checksumBitmask === ChecksumBitmask.NONE) {
      // Doing a quick scan
      return this.getArchiveEntriesSingleFile(info, checksumBitmask);
    }

    if (info.type === CHDType.CD_ROM) {
      return ChdBinCueParser.getArchiveEntriesBinCue(this, checksumBitmask);
    }
    if (info.type === CHDType.GD_ROM) {
      // TODO(cemmer): allow parsing GD-ROM to bin/cue https://github.com/mamedev/mame/issues/11903
      return ChdGdiParser.getArchiveEntriesGdRom(this, checksumBitmask);
    }

    return this.getArchiveEntriesSingleFile(info, checksumBitmask);
  }

  private async getArchiveEntriesSingleFile(
    info: CHDInfo,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<this>[]> {
    // MAME DAT <disk>s use the data+metadata SHA1 (vs. just the data SHA1)
    const rawEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: '',
        sha1: info.sha1,
        // There isn't a way for us to calculate these other checksums, so fill it in with garbage
        size: 0,
        crc32: checksumBitmask & ChecksumBitmask.CRC32 ? 'x'.repeat(8) : undefined,
        md5: checksumBitmask & ChecksumBitmask.MD5 ? 'x'.repeat(32) : undefined,
        sha256: checksumBitmask & ChecksumBitmask.SHA256 ? 'x'.repeat(64) : undefined,
      },
      checksumBitmask,
    );

    const extractedEntry = await ArchiveEntry.entryOf(
      {
        archive: this,
        entryPath: '',
        size: info.logicalSize,
        /**
         * NOTE(cemmer): the "data SHA1" equals the original input file in these tested cases:
         *  - PSP .iso -> .chd with createdvd (and NOT createcd)
         */
        sha1: info.dataSha1,
      },
      checksumBitmask,
    );

    return [rawEntry, extractedEntry];
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    return this.extractEntryToStreamCached(
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

  private async extractEntryToStreamCached<T>(
    entryPath: string,
    callback: (stream: Readable) => Promise<T> | T,
  ): Promise<T> {
    await this.tempSingletonMutex.runExclusive(async () => {
      this.tempSingletonHandles += 1;

      if (this.tempSingletonDirPath !== undefined) {
        return;
      }
      this.tempSingletonDirPath = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'chd'));
      this.tempSingletonFilePath = path.join(this.tempSingletonDirPath, 'extracted');

      const info = await this.getInfo();
      if (info.type === CHDType.RAW) {
        await chdman.extractRaw({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
          binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
        });
      } else if (info.type === CHDType.HARD_DISK) {
        await chdman.extractHd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
          binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
        });
      } else if (info.type === CHDType.CD_ROM) {
        const cueFile = `${this.tempSingletonFilePath}.cue`;
        this.tempSingletonFilePath += '.bin';
        await chdman.extractCd({
          inputFilename: this.getFilePath(),
          outputFilename: cueFile,
          outputBinFilename: this.tempSingletonFilePath,
          binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
        });
        await FsPoly.rm(cueFile, { force: true });
      } else if (info.type === CHDType.GD_ROM) {
        this.tempSingletonFilePath = path.join(this.tempSingletonDirPath, 'track.gdi');
        await chdman.extractCd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
          binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
        });
        // Apply TOSEC-style CRLF line separators to the .gdi file
        await util.promisify(fs.writeFile)(
          this.tempSingletonFilePath,
          (await util.promisify(fs.readFile)(this.tempSingletonFilePath))
            .toString()
            .replaceAll(/\r?\n/g, '\r\n'),
        );
      } else if (info.type === CHDType.DVD_ROM) {
        await chdman.extractDvd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
          binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
        });
      } else {
        throw new ExpectedError(`couldn't detect CHD type for: ${this.getFilePath()}`);
      }

      if (!(await FsPoly.exists(this.tempSingletonFilePath))) {
        throw new ExpectedError(
          `failed to extract ${this.getFilePath()}|${entryPath} to ${this.tempSingletonFilePath}`,
        );
      }
    });

    const [extractedEntryPath, sizeAndOffset] = entryPath.split('|');
    let filePath = this.tempSingletonFilePath!;
    if (
      extractedEntryPath &&
      (await FsPoly.exists(path.join(this.tempSingletonDirPath!, extractedEntryPath)))
    ) {
      // The entry path is the name of a real extracted file, use that
      filePath = path.join(this.tempSingletonDirPath!, extractedEntryPath);
    }

    // Parse the entry path for any extra start/stop parameters
    const [trackSize, trackOffset] = (sizeAndOffset ?? '').split('@');
    const streamStart = Number.parseInt(trackOffset ?? '0', 10);
    const streamEnd =
      !trackSize || Number.isNaN(Number(trackSize))
        ? undefined
        : Number.parseInt(trackOffset ?? '0', 10) + Number.parseInt(trackSize, 10) - 1;

    try {
      return await File.createStreamFromFile(filePath, callback, streamStart, streamEnd);
    } catch (error) {
      throw new ExpectedError(
        `failed to read ${this.getFilePath()}|${entryPath} at ${filePath}: ${error}`,
      );
    } finally {
      // Give a grace period before deleting the temp file, the next read may be of the same file
      setTimeout(async () => {
        await this.tempSingletonMutex.runExclusive(async () => {
          this.tempSingletonHandles -= 1;
          if (this.tempSingletonHandles <= 0) {
            await FsPoly.rm(this.tempSingletonDirPath!, { recursive: true, force: true });
            this.tempSingletonDirPath = undefined;
          }
        });
      }, 5000);
    }
  }

  @Memoize()
  async getInfo(): Promise<CHDInfo> {
    return chdman.info({
      inputFilename: this.getFilePath(),
      binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
