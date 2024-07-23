import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import util from 'node:util';

import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, CHDType } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import ExpectedError from '../../../expectedError.js';
import File from '../../file.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import ChdBinCueParser from './chdBinCueParser.js';
import ChdGdiParser from './chdGdiParser.js';

export default class Chd extends Archive {
  private tempSingletonHandles = 0;

  private readonly tempSingletonMutex = new Mutex();

  private tempSingletonDirPath?: string;

  private tempSingletonFilePath?: string;

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Chd(filePath);
  }

  static getExtensions(): string[] {
    return ['.chd'];
  }

  // eslint-disable-next-line class-methods-use-this
  getExtension(): string {
    return Chd.getExtensions()[0];
  }

  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<this>[]> {
    const info = await this.getInfo();
    if (info.type === CHDType.CD_ROM) {
      return ChdBinCueParser.getArchiveEntriesBinCue(this, checksumBitmask);
    } if (info.type === CHDType.GD_ROM) {
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
    const rawEntry = await ArchiveEntry.entryOf({
      archive: this,
      entryPath: '',
      size: info.logicalSize,
      sha1: info.sha1,
    }, ChecksumBitmask.NONE);

    const extractedEntry = await ArchiveEntry.entryOf({
      archive: this,
      entryPath: '',
      size: info.logicalSize,
      /**
       * NOTE(cemmer): the "data SHA1" equals the original input file in these tested cases:
       *  - PSP .iso -> .chd with createdvd (and NOT createcd)
       */
      sha1: info.dataSha1,
    }, checksumBitmask);

    return [rawEntry, extractedEntry];
  }

  async extractEntryToStream<T>(
    entryPath: string,
    callback: (stream: Readable) => (Promise<T> | T),
    start: number = 0,
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
        });
      } else if (info.type === CHDType.HARD_DISK) {
        await chdman.extractHd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
        });
      } else if (info.type === CHDType.CD_ROM) {
        const cueFile = `${this.tempSingletonFilePath}.cue`;
        this.tempSingletonDirPath += '.bin';
        await chdman.extractCd({
          inputFilename: this.getFilePath(),
          outputFilename: cueFile,
          outputBinFilename: this.tempSingletonFilePath,
        });

        console.log(`INFO: extracted ${cueFile}, ${this.tempSingletonFilePath} ?`);
        console.log(`INFO: ${(await FsPoly.walk(this.tempSingletonDirPath)).join('\n')}`);

        await FsPoly.rm(cueFile, { force: true });
      } else if (info.type === CHDType.GD_ROM) {
        this.tempSingletonFilePath = path.join(this.tempSingletonDirPath, 'track.gdi');
        await chdman.extractCd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
        });
        // Apply TOSEC-style CRLF line separators to the .gdi file
        await util.promisify(fs.writeFile)(
          this.tempSingletonFilePath,
          (await util.promisify(fs.readFile)(this.tempSingletonFilePath)).toString()
            .replace(/\r?\n/g, '\r\n'),
        );
      } else if (info.type === CHDType.DVD_ROM) {
        await chdman.extractDvd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
        });
      } else {
        throw new ExpectedError(`couldn't detect CHD type for: ${this.getFilePath()}`);
      }

      if (!await FsPoly.exists(this.tempSingletonFilePath)) {
        console.log(`ERROR: failed to extract ${this.getFilePath()}|${entryPath} to ${this.tempSingletonFilePath}`);
        throw new ExpectedError(`failed to extract ${this.getFilePath()}|${entryPath} to ${this.tempSingletonFilePath}`);
      } else {
        console.log(`INFO: succeeded to extract ${this.getFilePath()}|${entryPath} to ${this.tempSingletonFilePath}`);
      }
    });

    const [extractedEntryPath, sizeAndOffset] = entryPath.split('|');
    let filePath = this.tempSingletonFilePath as string;
    if (await FsPoly.exists(path.join(this.tempSingletonDirPath as string, extractedEntryPath))) {
      filePath = path.join(this.tempSingletonDirPath as string, extractedEntryPath);
    }

    const [trackSize, trackOffset] = (sizeAndOffset ?? '').split('@');
    const streamStart = Number.parseInt(trackOffset ?? '0', 10) + start;
    const streamEnd = !trackSize || Number.isNaN(Number(trackSize))
      ? undefined
      : Number.parseInt(trackOffset ?? '0', 10) + Number.parseInt(trackSize, 10) - 1;

    try {
      return await File.createStreamFromFile(
        filePath,
        callback,
        streamStart,
        streamEnd,
      );
    } catch (error) {
      throw new ExpectedError(`failed to read ${this.getFilePath()}|${entryPath} at ${filePath}: ${error}`);
    } finally {
      await this.tempSingletonMutex.runExclusive(async () => {
        this.tempSingletonHandles -= 1;
        if (this.tempSingletonHandles <= 0) {
          await FsPoly.rm(this.tempSingletonDirPath as string, { recursive: true, force: true });
          this.tempSingletonDirPath = undefined;
        }
      });
    }
  }

  // eslint-disable-next-line class-methods-use-this,@typescript-eslint/require-await
  async extractEntryToFile(
    entryPath: string,
    extractedFilePath: string,
  ): Promise<void> {
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

  @Memoize()
  private async getInfo(): Promise<CHDInfo> {
    return chdman.info({ inputFilename: this.getFilePath() });
  }
}
