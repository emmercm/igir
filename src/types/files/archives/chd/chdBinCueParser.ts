import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import {
  File as CueFile, parse, Track, TrackDataType,
} from '@gplane/cue';
import chdman from 'chdman';

import Constants from '../../../../constants.js';
import ArrayPoly from '../../../../polyfill/arrayPoly.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import FileChecksums from '../../fileChecksums.js';
import Archive from '../archive.js';
import ArchiveEntry from '../archiveEntry.js';

/**
 * https://github.com/putnam/binmerge
 */
export default class ChdBinCueParser {
  public static async getArchiveEntriesBinCue<T extends Archive>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const tempFile = await FsPoly.mktemp(path.join(
      Constants.GLOBAL_TEMP_DIR,
      path.basename(archive.getFilePath()),
    ));
    const cueFile = `${tempFile}.cue`;
    const binFile = `${tempFile}.bin`;

    try {
      await chdman.extractCd({
        inputFilename: archive.getFilePath(),
        outputFilename: cueFile,
        outputBinFilename: binFile,
      });
      return await this.parseCue(archive, cueFile, binFile, checksumBitmask);
    } finally {
      await FsPoly.rm(cueFile, { force: true });
      await FsPoly.rm(binFile, { force: true });
    }
  }

  private static async parseCue<T extends Archive>(
    archive: T,
    cueFilePath: string,
    binFilePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const cueData = await util.promisify(fs.readFile)(cueFilePath);
    const cueSheet = parse(cueData.toString(), {
      fatal: true,
    }).sheet;

    return (await Promise.all(cueSheet.files.flatMap(async (file) => this.parseCueFile(
      archive,
      file,
      binFilePath,
      checksumBitmask,
    ))))
      .flat()
      .filter(ArrayPoly.filterNotNullish);
  }

  private static async parseCueFile<T extends Archive>(
    archive: T,
    file: CueFile,
    binFilePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    // Determine the global block size from the first track in the file
    const filePath = path.join(path.dirname(binFilePath), file.name);
    const fileSize = await FsPoly.size(filePath);
    const firstTrack = file.tracks.at(0);
    if (!firstTrack) {
      return [];
    }
    const globalBlockSize = ChdBinCueParser.parseCueTrackBlockSize(firstTrack);
    let nextItemTimeOffset = Math.floor(fileSize / globalBlockSize);

    const { name: archiveName } = path.parse(archive.getFilePath());
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
            archive,
            entryPath: `${archiveName} (Track ${track.trackNumber}).bin|${trackSize}@${trackOffset}`,
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
}
