import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import async, { AsyncResultCallback } from 'async';
import chdman from 'chdman';
import fg from 'fast-glob';

import Constants from '../../../../constants.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import FileChecksums from '../../fileChecksums.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';

/**
 * https://dreamcast.wiki/GDI_format
 */
export default class ChdGdiParser {
  public static async getArchiveEntriesGdRom(
    archive: Chd,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Chd>[]> {
    const tempFile = await FsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(archive.getFilePath()),
    ));
    const gdiFilePath = `${tempFile}.gdi`;
    let binRawFilePaths: string[] = [];

    try {
      await chdman.extractCd({
        inputFilename: archive.getFilePath(),
        outputFilename: gdiFilePath,
      });
      binRawFilePaths = await fg(`${fg.convertPathToPattern(tempFile)}[0-9][0-9].{bin,raw}`);
      if (binRawFilePaths.length === 0) {
        throw new Error(`failed to find bin/raw files for GD-ROM: ${archive.getFilePath()}`);
      }
      return await this.parseGdi(archive, gdiFilePath, binRawFilePaths, checksumBitmask);
    } finally {
      await FsPoly.rm(gdiFilePath, { force: true });
      await Promise.all(binRawFilePaths.map(async (file) => FsPoly.rm(file, { force: true })));
    }
  }

  private static async parseGdi(
    archive: Chd,
    gdiFilePath: string,
    binRawFilePaths: string[],
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Chd>[]> {
    const gdiData = await util.promisify(fs.readFile)(gdiFilePath);

    const { name: filePrefix } = path.parse(gdiFilePath);
    const tracks = `${gdiData.toString()
      .split(/\r?\n/)
      .filter((line) => line)
      // Replace the chdman-generated track files with TOSEC-style track filenames
      .map((line) => line
        .replace(filePrefix, 'track')
        .replace(/"/g, ''))
      .join('\r\n')}\r\n`;

    const { name: archiveName } = path.parse(archive.getFilePath());
    const gdiFile = await ArchiveEntry.entryOf({
      archive,
      entryPath: `${archiveName}.gdi`,
      size: tracks.length,
      ...await FileChecksums.hashData(tracks, checksumBitmask),
    });

    const binRawFiles = await async.mapLimit(
      binRawFilePaths,
      Constants.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (binRawFilePath, callback: AsyncResultCallback<ArchiveEntry<Chd>, Error>) => {
        try {
          const binRawFile = await ArchiveEntry.entryOf({
            archive,
            entryPath: binRawFilePath.replace(filePrefix, 'track'),
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
