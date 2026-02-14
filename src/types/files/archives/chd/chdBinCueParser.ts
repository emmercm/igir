import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import type { File as CueFile, Track } from '@gplane/cue';
import { parse, TrackDataType } from '@gplane/cue';

import Temp from '../../../../globals/temp.js';
import FsPoly from '../../../../polyfill/fsPoly.js';
import StreamPoly from '../../../../polyfill/streamPoly.js';
import IgirException from '../../../exceptions/igirException.js';
import type { ChecksumProps } from '../../fileChecksums.js';
import FileChecksums, { ChecksumBitmask } from '../../fileChecksums.js';
import ArchiveEntry from '../archiveEntry.js';
import type Chd from './chd.js';

/**
 * https://github.com/putnam/binmerge
 */
export default class ChdBinCueParser {
  static async getArchiveEntriesBinCue<T extends Chd>(
    archive: T,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const tempDir = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'chd-bin-cue'));

    try {
      const cueFile = (await archive.extractArchiveEntries(tempDir)).find((filePath) =>
        filePath.endsWith('.cue'),
      );
      if (cueFile === undefined) {
        throw new IgirException('failed to extract .cue file');
      }
      return await this.parseCue(archive, cueFile, checksumBitmask);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  }

  private static async parseCue<T extends Chd>(
    archive: T,
    cueFilePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    const cueData = await util.promisify(fs.readFile)(cueFilePath);
    const cueSheet = parse(cueData.toString(), {
      fatal: true,
    }).sheet;

    const binFiles = (
      await Promise.all(
        cueSheet.files.flatMap(
          async (file) =>
            await this.parseCueFile(archive, file, path.dirname(cueFilePath), checksumBitmask),
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

  private static async parseCueFile<T extends Chd>(
    archive: T,
    file: CueFile,
    binFileDir: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<T>[]> {
    // Determine the global block size from the first track in the file
    const filePath = path.join(binFileDir, file.name);
    const fileSize = await FsPoly.size(filePath);
    const firstTrack = file.tracks.at(0);
    if (!firstTrack) {
      // The file has no tracks, so we can't extract anything
      return [];
    }
    const globalBlockSize = ChdBinCueParser.parseCueTrackBlockSize(firstTrack);
    let nextItemTimeOffset = Math.floor(fileSize / globalBlockSize);

    const archiveEntries: ArchiveEntry<T>[] = [];
    for (const track of file.tracks.toReversed()) {
      const firstIndex = track.indexes.at(0);
      if (!firstIndex) {
        // The track has no indexes, so we can't extract anything
        continue;
      }

      const startingTimeOffset = ChdBinCueParser.calculateLength(firstIndex.startingTime);
      const sectors = nextItemTimeOffset - startingTimeOffset;
      nextItemTimeOffset = startingTimeOffset;
      const trackOffset = startingTimeOffset * globalBlockSize;
      const trackSize = sectors * globalBlockSize;
      const pregapSize = ChdBinCueParser.calculateLength(track.preGap) * globalBlockSize;
      const postgapSize = ChdBinCueParser.calculateLength(track.postGap) * globalBlockSize;

      // Calculate checksums, including the pregap
      let checksums: ChecksumProps;
      const readStream = fs.createReadStream(filePath);
      try {
        const pregappedStream =
          pregapSize + postgapSize > 0
            ? StreamPoly.concat(
                StreamPoly.staticReadable(pregapSize, 0x00),
                readStream,
                StreamPoly.staticReadable(postgapSize, 0x00),
              )
            : readStream;
        checksums = await FileChecksums.hashStream(pregappedStream, checksumBitmask);
      } finally {
        readStream.close();
      }

      archiveEntries.push(
        await ArchiveEntry.entryOf(
          {
            archive,
            entryPath: `${file.name}|${trackSize}+${pregapSize}+${postgapSize}@${trackOffset}`,
            size: trackSize + pregapSize + postgapSize,
            ...checksums,
          },
          checksumBitmask,
        ),
      );
    }
    return archiveEntries.toReversed();
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
        throw new IgirException(`unknown track type ${TrackDataType[firstTrack.dataType]}`);
      }
    }
  }

  private static calculateLength(minuteSecondFrame: [number, number, number] | undefined): number {
    if (minuteSecondFrame === undefined) {
      return 0;
    }
    const [minutes, seconds, frames] = minuteSecondFrame;
    return minutes * 60 * 75 + seconds * 75 + frames;
  }
}
