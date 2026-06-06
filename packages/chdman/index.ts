import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

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

// The raw pull-based handle the native addon returns. Internal only: callers
// consume the stream.Readable wrapper returned by openTrackReader/openRawReader.
interface NativeTrackReader {
  read: (maxBytes: number) => Promise<Buffer | null>;
  close: () => void;
}

export interface OpenTrackReaderOptions {
  inputFilename: string;
  mode: 'cuebin' | 'gdi';
  trackIndex: number;
}

export interface OpenRawReaderOptions {
  inputFilename: string;
}

const MODE_CUEBIN = 1;
const MODE_GDI = 2;
// The track-listing/reading mode the native addon understands. Constrained to the
// two valid values so callers can't pass an arbitrary number.
type ChdmanMode = typeof MODE_CUEBIN | typeof MODE_GDI;
const READER_CHUNK_SIZE = 1024 * 1024; // 1 MiB per pull

interface ChdmanBinding {
  info: (inputFilename: string) => Promise<Omit<CHDInfo, 'type'> & { type: string }>;
  listTracks: (
    inputFilename: string,
    mode: ChdmanMode,
    binPatternOrBase: string,
    tocName: string,
  ) => Promise<TrackListing>;
  openTrackReader: (
    inputFilename: string,
    mode: ChdmanMode,
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
    /* fall through to local build */
  }
  return require('./build/Release/chdman.node') as ChdmanBinding;
})();

const exported = {
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
   * List the tracks of a CD-ROM CHD as they would be extracted to a cue/bin
   * pair, returning the cue TOC text and a descriptor for every track.
   */
  async listCdBinCueTracks(options: ListCdBinCueOptions): Promise<TrackListing> {
    return await binding.listTracks(
      options.inputFilename,
      MODE_CUEBIN,
      options.binNamePattern,
      options.cueName,
    );
  },

  /**
   * List the tracks of a GD-ROM CHD as they would be extracted to a gdi plus
   * split track files, returning the gdi TOC text and a descriptor for every track.
   */
  async listGdRomTracks(options: ListGdRomOptions): Promise<TrackListing> {
    return await binding.listTracks(
      options.inputFilename,
      MODE_GDI,
      options.trackBaseName,
      options.gdiName,
    );
  },

  /**
   * Open a pull-based {@link stream.Readable} over a single CD-ROM (cue/bin) or
   * GD-ROM (gdi) track, yielding exactly the bytes chdman writes for that
   * split-bin track. The underlying CHD is released when the stream ends, errors,
   * or is destroyed.
   */
  async openTrackReader(options: OpenTrackReaderOptions): Promise<stream.Readable> {
    const mode = options.mode === 'gdi' ? MODE_GDI : MODE_CUEBIN;
    const reader = binding.openTrackReader(options.inputFilename, mode, options.trackIndex);
    return await Promise.resolve(readableFromReader(reader));
  },

  /**
   * Open a pull-based {@link stream.Readable} over the full logical byte range of
   * a RAW, HARD_DISK, or DVD CHD, yielding exactly the bytes chdman's extractRaw
   * would write. The underlying CHD is released when the stream ends, errors, or
   * is destroyed.
   */
  async openRawReader(options: OpenRawReaderOptions): Promise<stream.Readable> {
    const reader = binding.openRawReader(options.inputFilename);
    return await Promise.resolve(readableFromReader(reader));
  },
};
export default exported;

/**
 * Wrap a native CHD reader in a pull-based Readable. The reader is closed when
 * the stream ends, errors, or is destroyed. Callers must consume the stream to
 * its end or call `destroy()` so the native reader is released.
 */
function readableFromReader(reader: NativeTrackReader): stream.Readable {
  let closed = false;
  const closeOnce = (): void => {
    if (!closed) {
      closed = true;
      reader.close();
    }
  };
  return new stream.Readable({
    highWaterMark: READER_CHUNK_SIZE,
    async read(): Promise<void> {
      try {
        const chunk = await reader.read(READER_CHUNK_SIZE);
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
