import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, CHDType } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Constants from '../../../../constants.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import File from '../../file.js';
import FileCache from '../../fileCache.js';
import { ChecksumBitmask } from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';
import ChdCdParser from './chdCdParser.js';
import ChdGdiParser from './chdGdiParser.js';

export default class Chd extends Archive {
  static readonly SUPPORTED_EXTENSIONS = ['.chd'];

  private tempSingletonHandles = 0;

  private readonly tempSingletonMutex = new Mutex();

  private tempSingletonFilePath?: string;

  // eslint-disable-next-line class-methods-use-this
  protected new(filePath: string): Archive {
    return new Chd(filePath);
  }

  @FileCache.CacheArchiveEntries()
  async getArchiveEntries(checksumBitmask: number): Promise<ArchiveEntry<Chd>[]> {
    const info = await this.getInfo();
    if (info.type === CHDType.CD_ROM) {
      return ChdCdParser.getArchiveEntriesCdRom(this, checksumBitmask);
    } if (info.type === CHDType.GD_ROM) {
      // TODO(cemmer): allow parsing GD-ROM to bin/cue https://github.com/mamedev/mame/issues/11903
      return ChdGdiParser.getArchiveEntriesGdRom(this, checksumBitmask);
    }
    return this.getArchiveEntriesSingleFile(info, checksumBitmask);
  }

  private async getArchiveEntriesSingleFile(
    info: CHDInfo,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Chd>[]> {
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
      if (this.tempSingletonFilePath !== undefined) {
        return;
      }
      this.tempSingletonFilePath = await FsPoly.mktemp(path.join(
        Constants.GLOBAL_TEMP_DIR,
        path.basename(this.getFilePath()),
      ));

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
        await chdman.extractCd({
          inputFilename: this.getFilePath(),
          outputFilename: cueFile,
          outputBinFilename: this.tempSingletonFilePath,
        });
        await FsPoly.rm(cueFile, { force: true });
      } else if (info.type === CHDType.DVD_ROM) {
        await chdman.extractDvd({
          inputFilename: this.getFilePath(),
          outputFilename: this.tempSingletonFilePath,
        });
      } else {
        throw new Error(`couldn't detect CHD type for: ${this.getFilePath()}`);
      }
    });

    const [trackSize, trackOffset] = entryPath.split('@');
    const streamStart = Number.parseInt(trackOffset ?? '0', 10) + start;
    const streamEnd = trackSize === undefined
      ? undefined
      : Number.parseInt(trackOffset ?? '0', 10) + Number.parseInt(trackSize, 10) - 1;

    this.tempSingletonHandles += 1;
    try {
      return await File.createStreamFromFile(
        this.tempSingletonFilePath as string,
        callback,
        streamStart,
        streamEnd,
      );
    } finally {
      this.tempSingletonHandles -= 1;
      if (this.tempSingletonHandles === 0) {
        await this.tempSingletonMutex.runExclusive(async () => {
          await FsPoly.rm(this.tempSingletonFilePath as string, { force: true });
          this.tempSingletonFilePath = undefined;
        });
      }
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
