import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';

const require = module.createRequire(import.meta.url);

export const CHDType = {
  CD_ROM: 'CD_ROM',
  DVD_ROM: 'DVD_ROM',
  GD_ROM: 'GD_ROM',
  HARD_DISK: 'HARD_DISK',
  RAW: 'RAW',
} as const;
export type CHDType = (typeof CHDType)[keyof typeof CHDType];

export interface CHDInfo {
  inputFile: string;
  type: CHDType;
  fileVersion: number;
  logicalSize: number;
  hunkSize: number;
  totalHunks: number;
  unitSize: number;
  totalUnits: number;
  compression: string[];
  chdSize: number;
  sha1: string | undefined;
  dataSha1: string | undefined;
}

export interface InfoOptions {
  inputFilename: string;
}

export interface TrackDescriptor {
  index: number;
  filename: string;
  type: string;
  size: number;
}

export interface TrackListing {
  tocText: string;
  tracks: TrackDescriptor[];
}

export interface ListCdBinCueOptions {
  inputFilename: string;
  binNamePattern: string;
  cueName: string;
}

export interface ListGdRomOptions {
  inputFilename: string;
  trackBaseName: string;
  gdiName: string;
}

// The raw stream-based reader that the native addon returns
interface NativeTrackReader {
  read: (maxBytes: number) => Promise<Buffer | null>;
  close: () => void;
}

export const TrackReaderMode = {
  CUEBIN: 'cuebin',
  GDI: 'gdi',
} as const;
export type TrackReaderModeValue = (typeof TrackReaderMode)[keyof typeof TrackReaderMode];

export interface OpenTrackReaderOptions {
  inputFilename: string;
  mode: TrackReaderModeValue;
  trackIndex: number;
}

export interface OpenRawReaderOptions {
  inputFilename: string;
}

// The numeric track-listing/reading mode the native addon understands. Constrained to
// the two valid values so callers can't pass an arbitrary number.
const ChdmanMode = {
  CUEBIN: 1,
  GDI: 2,
} as const;
type ChdmanModeValue = (typeof ChdmanMode)[keyof typeof ChdmanMode];

interface ChdmanBinding {
  info: (inputFilename: string) => Promise<Omit<CHDInfo, 'type'> & { type: string }>;
  listTracks: (
    inputFilename: string,
    mode: ChdmanModeValue,
    binPatternOrBase: string,
    tocName: string,
  ) => Promise<TrackListing>;
  openTrackReader: (
    inputFilename: string,
    mode: ChdmanModeValue,
    trackIndex: number,
  ) => NativeTrackReader;
  openRawReader: (inputFilename: string) => NativeTrackReader;
}

const binding = ((): ChdmanBinding => {
  try {
    return require(
      `./addon-chdman/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    ) as ChdmanBinding;
  } catch {
    /* ignored */
  }
  return require('./addon-chdman/build/Release/chdman.node') as ChdmanBinding;
})();

/**
 * Wrap a native CHD reader in a {@link stream.Readable}. The reader is closed when the
 * stream ends, errors, or is destroyed. Callers must consume the stream to its end or
 * call `destroy()` so the native reader is released.
 */
function readableFromReader(reader: NativeTrackReader): stream.Readable {
  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;
    reader.close();
  };
  return new stream.Readable({
    highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    async read(): Promise<void> {
      try {
        const chunk = await reader.read(Defaults.FILE_READING_CHUNK_SIZE);
        if (chunk === null || chunk.length === 0) {
          closeOnce();
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
        } else {
          this.push(chunk);
        }
      } catch (error) {
        closeOnce();
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
    destroy(error, callback): void {
      closeOnce();
      callback(error);
    },
  });
}

export default {
  /**
   * Return structured information about a CHD file's header.
   */
  async info(options: InfoOptions): Promise<CHDInfo> {
    const raw = await binding.info(options.inputFilename);
    const type = Object.values(CHDType).find((value) => value === raw.type);
    if (type === undefined) {
      throw new Error(`unexpected CHD type: ${raw.type}`);
    }
    return { ...raw, type };
  },

  /**
   * List the tracks of a CD-ROM CHD as they would be extracted to a .cue/.bin
   * pair, returning the cue TOC text and a descriptor for every track.
   */
  async listCdBinCueTracks(options: ListCdBinCueOptions): Promise<TrackListing> {
    return await binding.listTracks(
      options.inputFilename,
      ChdmanMode.CUEBIN,
      options.binNamePattern,
      options.cueName,
    );
  },

  /**
   * List the tracks of a GD-ROM CHD as they would be extracted to a .gdi plus
   * split track files, returning the gdi TOC text and a descriptor for every track.
   */
  async listGdRomTracks(options: ListGdRomOptions): Promise<TrackListing> {
    return await binding.listTracks(
      options.inputFilename,
      ChdmanMode.GDI,
      options.trackBaseName,
      options.gdiName,
    );
  },

  /**
   * Open a {@link stream.Readable} over a single CD-ROM (cue/bin) or GD-ROM (gdi) track,
   * yielding exactly the bytes chdman writes for that split-bin track.
   */
  openTrackReader(options: OpenTrackReaderOptions): stream.Readable {
    const mode = options.mode === TrackReaderMode.GDI ? ChdmanMode.GDI : ChdmanMode.CUEBIN;
    const reader = binding.openTrackReader(options.inputFilename, mode, options.trackIndex);
    return readableFromReader(reader);
  },

  /**
   * Open a {@link stream.Readable} over the full logical byte range of a RAW, HARD_DISK, or
   * DVD CHD, yielding exactly the bytes chdman's extractRaw would write.
   */
  openRawReader(options: OpenRawReaderOptions): stream.Readable {
    const reader = binding.openRawReader(options.inputFilename);
    return readableFromReader(reader);
  },
};
