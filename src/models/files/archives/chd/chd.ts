import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import { Mutex } from 'async-mutex';
import chdman, { CHDInfo, ChdmanBinaryPreference } from 'chdman';
import { Memoize } from 'typescript-memoize';

import Timer from '../../../../async/timer.js';
import IgirException from '../../../../exceptions/igirException.js';
import Temp from '../../../../globals/temp.js';
import FsUtil from '../../../../utils/fsUtil.js';
import StreamUtil from '../../../../utils/streamUtil.js';
import File from '../../file.js';
import Archive from '../archive.js';

/**
 * Base class for MAME Compressed Hunks of Data (CHD) disc/disk image formats.
 */
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

  /**
   * Returns false: entry paths for CHD formats are synthesized by Igir, not stored in the
   * archive.
   */
  hasMeaningfulEntryPaths(): boolean {
    return false;
  }

  /**
   * Extract the named entry from the CHD to the given file path.
   */
  async extractEntryToFile(entryPath: string, extractedFilePath: string): Promise<void> {
    await this.extractEntryToStreamCached(entryPath, async (readable) => {
      await stream.promises.pipeline(readable, fs.createWriteStream(extractedFilePath));
    });
  }

  abstract extractArchiveEntries(outputDirectory: string): Promise<string[]>;

  private async extractEntryToStreamCached<T>(
    entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
  ): Promise<T> {
    await this.tempSingletonMutex.runExclusive(async () => {
      this.tempSingletonHandles += 1;

      if (this.tempSingletonDirPath !== undefined) {
        return;
      }
      this.tempSingletonDirPath = await FsUtil.mkdtemp(path.join(Temp.getTempDir(), 'chd'));

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
    const pregapSize = pregapSizeString === undefined ? 0 : Math.trunc(Number(pregapSizeString));
    const postgapSize = postgapSizeString === undefined ? 0 : Math.trunc(Number(postgapSizeString));
    const streamStart = Math.trunc(Number(trackOffset ?? '0'));
    const streamEnd =
      !trackSize || Number.isNaN(Number(trackSize))
        ? undefined
        : Math.trunc(Number(trackOffset ?? '0')) + Math.trunc(Number(trackSize)) - 1;

    try {
      return await File.createStreamFromFile(
        filePath,
        async (readable) => {
          if (pregapSize + postgapSize > 0) {
            return await callback(
              StreamUtil.concat(
                StreamUtil.staticReadable(pregapSize, 0x00),
                readable,
                StreamUtil.staticReadable(postgapSize, 0x00),
              ),
            );
          }
          return await callback(readable);
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
              await FsUtil.rm(tempSingletonDirPath, { recursive: true, force: true });
            }
          });
        },
        process.env.NODE_ENV === 'test' ? 100 : 5000,
      );
    }
  }

  @Memoize()
  async getInfo(): Promise<CHDInfo> {
    return await chdman.info({
      inputFilename: this.getFilePath(),
      binaryPreference: ChdmanBinaryPreference.PREFER_PATH_BINARY,
    });
  }
}
