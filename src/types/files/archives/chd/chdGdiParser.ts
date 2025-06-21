import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import async from 'async';
import fg from 'fast-glob';

import Defaults from '../../../../globals/defaults.js';
import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import ExpectedError from '../../../expectedError.js';
import FileChecksums from '../../fileChecksums.js';
import ArchiveEntry from '../archiveEntry.js';
import Chd from './chd.js';

/**
 * https://dreamcast.wiki/GDI_format
 */
export default class ChdGdiParser {
  public static async getArchiveEntriesGdRom<T extends Chd>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const tempDir = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'chd-gdi'));

    let binRawFilePaths: string[] = [];
    try {
      const gdiFilePath = (await archive.extractArchiveEntries(tempDir)).find((filePath) =>
        filePath.endsWith('.gdi'),
      );
      if (gdiFilePath === undefined) {
        throw new ExpectedError(`failed to extract .gdi file`);
      }
      binRawFilePaths = await fg(`${fg.convertPathToPattern(tempDir)}/*.{bin,raw}`);
      if (binRawFilePaths.length === 0) {
        throw new ExpectedError(
          `failed to find bin/raw files for GD-ROM: ${archive.getFilePath()}`,
        );
      }
      return await this.parseGdi(archive, gdiFilePath, binRawFilePaths, checksumBitmask);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  }

  private static async parseGdi<T extends Chd>(
    archive: T,
    gdiFilePath: string,
    binRawFilePaths: string[],
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const gdiExtractedContents = await util.promisify(fs.readFile)(gdiFilePath);

    const { name: filePrefix } = path.parse(gdiFilePath);
    const gdiContents = `${gdiExtractedContents
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      // Replace the chdman-generated track files with TOSEC-style track filenames
      .map((line) => line.replace(filePrefix, 'track').replaceAll('"', ''))
      .join('\r\n')}\r\n`;

    const gdiFile = await ArchiveEntry.entryOf({
      archive,
      entryPath: path.basename(gdiFilePath),
      size: gdiContents.length,
      ...(await FileChecksums.hashData(gdiContents, checksumBitmask)),
    });

    const binRawFiles = await async.mapLimit(
      binRawFilePaths,
      Defaults.ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE,
      async (binRawFilePath: string): Promise<ArchiveEntry<T>> => {
        try {
          return await ArchiveEntry.entryOf({
            archive,
            entryPath: path.basename(binRawFilePath).replace(filePrefix, 'track'),
            size: await FsPoly.size(binRawFilePath),
            ...(await FileChecksums.hashFile(binRawFilePath, checksumBitmask)),
          });
        } catch (error) {
          if (error instanceof Error) {
            throw error;
          } else if (typeof error === 'string') {
            throw new Error(error);
          } else {
            throw new Error(`unknown error when parsing GD-ROM bin/raw file: ${binRawFilePath}`);
          }
        }
      },
    );

    return [gdiFile, ...binRawFiles];
  }
}
