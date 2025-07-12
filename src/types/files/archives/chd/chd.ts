import fs from 'node:fs';
import path from 'node:path';
import stream, { Readable } from 'node:stream';
import util from 'node:util';

import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, ChdmanBinaryPreference } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Timer from '../../../../async/timer.js';
import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import StreamPoly from '../../../../polyfill/streamPoly.js';
import IgirException from '../../../exceptions/igirException.js';
import File from '../../file.js';
import Archive from '../archive.js';

export default abstract class Chd extends Archive {
  private tempSingletonHandles = 0;

  private readonly tempSingletonMutex = new Mutex();

  private tempSingletonDirPath?: string;

  static getExtensions(): string[] {
    return ['.chd'];
  }

  getExtension(): string {
    return Chd.getExtensions()[0];
  }

  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    return this.extractEntryToStreamCached(entryPath, async (readable) => {
      await util.promisify(stream.pipeline)(readable, fs.createWriteStream(extractedFilePath));
    });
  }

  abstract extractArchiveEntries(outputDirectory: string): Promise<string[]>;

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

      const extractedFiles = await this.extractArchiveEntries(this.tempSingletonDirPath);
      if (extractedFiles.length === 0) {
        this.tempSingletonDirPath = undefined;
        throw new IgirException(`failed to extract`);
      }
    });

    const [extractedEntryPath, sizeAndOffset] = entryPath.split('|');
    if (this.tempSingletonDirPath === undefined) {
      throw new Error('CHD singleton path is required (this should never happen!)');
    }
    const filePath = path.join(this.tempSingletonDirPath, extractedEntryPath);

    // Parse the entry path for any extra start/stop parameters
    const [trackSizeAndPregap, trackOffset] = (sizeAndOffset ?? '').split('@');
    const [trackSize, pregapSizeString, postgapSizeString] = trackSizeAndPregap.split('+');
    const pregapSize = pregapSizeString === undefined ? 0 : Number.parseInt(pregapSizeString, 10);
    const postgapSize =
      postgapSizeString === undefined ? 0 : Number.parseInt(postgapSizeString, 10);
    const streamStart = Number.parseInt(trackOffset ?? '0', 10);
    const streamEnd =
      !trackSize || Number.isNaN(Number(trackSize))
        ? undefined
        : Number.parseInt(trackOffset ?? '0', 10) + Number.parseInt(trackSize, 10) - 1;

    try {
      return await File.createStreamFromFile(
        filePath,
        async (readable) => {
          if (pregapSize + postgapSize > 0) {
            return callback(
              StreamPoly.concat(
                StreamPoly.staticReadable(pregapSize, 0x00),
                readable,
                StreamPoly.staticReadable(postgapSize, 0x00),
              ),
            );
          }
          return callback(readable);
        },
        streamStart,
        streamEnd,
      );
    } catch (error) {
      throw new IgirException(
        `failed to read ${this.getFilePath()}|${entryPath} at ${filePath}: ${error}`,
      );
    } finally {
      // Give a grace period before deleting the temp file, the next read may be of the same file
      Timer.setTimeout(
        async () => {
          await this.tempSingletonMutex.runExclusive(async () => {
            this.tempSingletonHandles -= 1;
            if (this.tempSingletonHandles <= 0 && this.tempSingletonDirPath !== undefined) {
              const tempSingletonDirPath = this.tempSingletonDirPath;
              this.tempSingletonDirPath = undefined;
              await FsPoly.rm(tempSingletonDirPath, { recursive: true, force: true });
            }
          });
        },
        process.env.NODE_ENV === 'test' ? 100 : 5000,
      );
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
