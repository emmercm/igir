import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import util from 'node:util';

import {
  File as CueFile, parse, Track, TrackDataType,
} from '@gplane/cue';
import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, CHDType } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Constants from '../../../constants.js';
import ArrayPoly from '../../../polyfill/arrayPoly.js';
import FsPoly from '../../../polyfill/fsPoly.js';
import File from '../file.js';
import FileCache from '../fileCache.js';
import FileChecksums, { ChecksumBitmask } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';

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
      return this.getArchiveEntriesCdRom(checksumBitmask);
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
      sha1: info.dataSha1,
    }, checksumBitmask);

    return [rawEntry, extractedEntry];
  }

  private async getArchiveEntriesCdRom(checksumBitmask: number): Promise<ArchiveEntry<Chd>[]> {
    const tempFile = await FsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(this.getFilePath()),
    ));
    const cueFile = `${tempFile}.cue`;
    const binFile = `${tempFile}.bin`;

    try {
      await chdman.extractCd({
        inputFilename: this.getFilePath(),
        outputFilename: cueFile,
        outputBinFilename: binFile,
      });
      return await this.parseCue(cueFile, binFile, checksumBitmask);
    } finally {
      await FsPoly.rm(cueFile, { force: true });
      await FsPoly.rm(binFile, { force: true });
    }
  }

  private async parseCue(
    cueFilePath: string,
    binFilePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Chd>[]> {
    const cueData = await util.promisify(fs.readFile)(cueFilePath);
    const cueSheet = parse(cueData.toString(), {
      fatal: true,
    }).sheet;

    return (await Promise.all(
      cueSheet.files.flatMap(async (file) => this.parseCueFile(file, binFilePath, checksumBitmask)),
    ))
      .flat()
      .filter(ArrayPoly.filterNotNullish);
  }

  private async parseCueFile(
    file: CueFile,
    binFilePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Chd>[]> {
    // Determine the global block size from the first track in the file
    const filePath = path.join(path.dirname(binFilePath), file.name);
    const fileSize = await FsPoly.size(filePath);
    const firstTrack = file.tracks.at(0);
    if (!firstTrack) {
      return [];
    }
    const globalBlockSize = Chd.parseCueTrackBlockSize(firstTrack);
    let nextItemTimeOffset = Math.floor(fileSize / globalBlockSize);

    return (await Promise.all(
      file.tracks
        .reverse()
        .flatMap(async (track) => {
          const firstIndex = track.indexes.at(0);
          if (!firstIndex) {
            return undefined;
          }

          const [minutes, seconds, fields] = firstIndex.startingTime;
          const startingTimeOffset = fields + (seconds * 75) + (minutes * 60 * 75);
          const sectors = nextItemTimeOffset - startingTimeOffset;
          nextItemTimeOffset = startingTimeOffset;
          const trackOffset = startingTimeOffset * globalBlockSize;
          const trackSize = sectors * globalBlockSize;

          const checksums = await FileChecksums.hashFile(
            binFilePath,
            checksumBitmask,
            trackOffset,
            trackOffset + trackSize - 1,
          );

          return ArchiveEntry.entryOf({
            archive: this,
            entryPath: `${trackSize}@${trackOffset}`,
            size: trackSize,
            ...checksums,
          }, checksumBitmask);
        })
        .reverse(),
    )).filter(ArrayPoly.filterNotNullish);
  }

  private static parseCueTrackBlockSize(firstTrack: Track): number {
    switch (firstTrack.dataType) {
      case TrackDataType.Audio:
      case TrackDataType['Mode1/2352']:
      case TrackDataType['Mode2/2352']:
      case TrackDataType['Cdi/2352']:
        return 2352;
      case TrackDataType.Cdg:
        return 2448;
      case TrackDataType['Mode1/2048']:
        return 2048;
      case TrackDataType['Mode2/2336']:
      case TrackDataType['Cdi/2336']:
        return 2336;
      default:
        throw new Error(`unknown track type ${TrackDataType[firstTrack.dataType]}`);
    }
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
