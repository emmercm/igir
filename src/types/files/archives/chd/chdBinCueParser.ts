import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { File as CueFile, parse, Track, TrackDataType } from '@gplane/cue';
import chdman from 'chdman';

import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import ExpectedError from '../../../expectedError.js';
import FileChecksums, { ChecksumBitmask } from '../../fileChecksums.js';
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
    const tempFile = await FsPoly.mktemp(
      path.join(Temp.getTempDir(), path.basename(archive.getFilePath())),
    );

    const tempDir = path.dirname(tempFile);
    if (!(await FsPoly.exists(tempDir))) {
      await FsPoly.mkdir(tempDir, { recursive: true });
    }

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

    const binFiles = (
      await Promise.all(
        cueSheet.files.flatMap(async (file) =>
          this.parseCueFile(archive, file, binFilePath, checksumBitmask),
        ),
      )
    ).flat();

    const cueFile = await ArchiveEntry.entryOf({
      archive,
      entryPath: `${path.parse(archive.getFilePath()).name}.cue`,
      // Junk size and checksums because we don't know what it should be
      size: 0,
      crc32: checksumBitmask & ChecksumBitmask.CRC32 ? 'x'.repeat(8) : undefined,
      md5: checksumBitmask & ChecksumBitmask.MD5 ? 'x'.repeat(32) : undefined,
      sha1: checksumBitmask & ChecksumBitmask.SHA1 ? 'x'.repeat(40) : undefined,
      sha256: checksumBitmask & ChecksumBitmask.SHA256 ? 'x'.repeat(64) : undefined,
    });

    return [cueFile, ...binFiles];
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
    return (
      await Promise.all(
        file.tracks
          .reverse()
          .flatMap(async (track) => {
            const firstIndex = track.indexes.at(0);
            if (!firstIndex) {
              return undefined;
            }

            const [minutes, seconds, fields] = firstIndex.startingTime;
            const startingTimeOffset = fields + seconds * 75 + minutes * 60 * 75;
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

            return ArchiveEntry.entryOf(
              {
                archive,
                entryPath: `${archiveName} (Track ${track.trackNumber}).bin|${trackSize}@${trackOffset}`,
                size: trackSize,
                ...checksums,
              },
              checksumBitmask,
            );
          })
          .reverse(),
      )
    ).filter((entry) => entry !== undefined);
  }

  private static parseCueTrackBlockSize(firstTrack: Track): number {
    switch (firstTrack.dataType) {
      case TrackDataType.Audio:
      case TrackDataType['Mode1/2352']:
      case TrackDataType['Mode2/2352']:
      case TrackDataType['Cdi/2352']: {
        return 2352;
      }
      case TrackDataType.Cdg: {
        return 2448;
      }
      case TrackDataType['Mode1/2048']: {
        return 2048;
      }
      case TrackDataType['Mode2/2336']:
      case TrackDataType['Cdi/2336']: {
        return 2336;
      }
      default: {
        throw new ExpectedError(`unknown track type ${TrackDataType[firstTrack.dataType]}`);
      }
    }
  }
}
