import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import async, { AsyncResultCallback } from 'async';
import chdman from 'chdman';
import fg from 'fast-glob';

import Constants from '../../../../constants.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import FileChecksums from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * https://dreamcast.wiki/GDI_format
 */
export default class ChdGdiParser {
  public static async getArchiveEntriesGdRom<T extends Archive>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const tempDir = await FsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'chd-gdi'));
    const gdiFilePath = path.join(tempDir, 'track.gdi');
    let binRawFilePaths: string[] = [];

    try {
      await chdman.extractCd({
        inputFilename: archive.getFilePath(),
        outputFilename: gdiFilePath,
      });
      binRawFilePaths = await fg(`${fg.convertPathToPattern(tempDir)}/*.{bin,raw}`);
      if (binRawFilePaths.length === 0) {
        throw new Error(`failed to find bin/raw files for GD-ROM: ${archive.getFilePath()}`);
      }
      return await this.parseGdi(archive, gdiFilePath, binRawFilePaths, checksumBitmask);
    } finally {
      await FsPoly.rm(gdiFilePath, { force: true });
      await Promise.all(binRawFilePaths.map(async (file) => FsPoly.rm(file, { force: true })));
    }
  }

  private static async parseGdi<T extends Archive>(
    archive: T,
    gdiFilePath: string,
    binRawFilePaths: string[],
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const gdiExtractedContents = await util.promisify(fs.readFile)(gdiFilePath);

    const { name: filePrefix } = path.parse(gdiFilePath);
    const gdiContents = `${gdiExtractedContents.toString()
      .split(/\r?\n/)
      .filter((line) => line)
      // Replace the chdman-generated track files with TOSEC-style track filenames
      .map((line) => line
        .replace(filePrefix, 'track')
        .replace(/"/g, ''))
      .join('\r\n')}\r\n`;

    const gdiFile = await ArchiveEntry.entryOf({
      archive,
      entryPath: path.basename(gdiFilePath),
      size: gdiContents.length,
      ...await FileChecksums.hashData(gdiContents, checksumBitmask),
    });

    const binRawFiles = await async.mapLimit(
      binRawFilePaths,
      Constants.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (binRawFilePath, callback: AsyncResultCallback<ArchiveEntry<T>, Error>) => {
        try {
          const binRawFile = await ArchiveEntry.entryOf({
            archive,
            entryPath: path.basename(binRawFilePath).replace(filePrefix, 'track'),
            size: await FsPoly.size(binRawFilePath),
            ...await FileChecksums.hashFile(binRawFilePath, checksumBitmask),
          });
          callback(undefined, binRawFile);
        } catch (error) {
          if (error instanceof Error) {
            callback(error);
          } else if (typeof error === 'string') {
            callback(new Error(error));
          } else {
            callback(new Error(`unknown error when parsing GD-ROM bin/raw file: ${binRawFilePath}`));
          }
        }
      },
    );

    return [gdiFile, ...binRawFiles];
  }
}
