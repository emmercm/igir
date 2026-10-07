import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import { type Context, getDefaultContext } from '@emnapi/runtime';

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
  /**
   * The path of the CHD, exactly as it was passed in {@link InfoOptions.inputFilename}.
   */
  inputFile: string;
  /**
   * The kind of media the CHD holds, determined by its metadata. A CHD with no recognized
   * metadata is {@link CHDType.RAW}.
   */
  type: CHDType;
  /**
   * The CHD format version from the header.
   */
  fileVersion: number;
  /**
   * The length of the uncompressed media in bytes.
   */
  logicalSize: number;
  /**
   * The length of a hunk in bytes. A hunk is the unit the CHD compresses and stores
   * independently.
   */
  hunkSize: number;
  /**
   * The number of hunks the media is split into.
   */
  totalHunks: number;
  /**
   * The length of a unit in bytes. A unit is the media's own block size, e.g. 2448 for a CD
   * frame and its subcode, or 512 for a hard disk sector.
   */
  unitSize: number;
  /**
   * The number of units in the media.
   */
  totalUnits: number;
  /**
   * The four-character names of the codecs the CHD may compress hunks with, in header order,
   * e.g. `['cdlz', 'cdzl', 'cdfl']`. Empty when the CHD is uncompressed.
   */
  compression: string[];
  /**
   * The length of the CHD file itself in bytes.
   */
  chdSize: number;
  /**
   * The SHA-1 recorded in the header: of the media and its metadata combined for v4 and v5
   * CHDs, or of the media alone for v3 CHDs. `undefined` when the header records none, as in
   * an uncompressed CHD.
   */
  sha1: string | undefined;
  /**
   * The SHA-1 of the uncompressed media alone, as recorded in the header. `undefined` for v3
   * CHDs, which have no such field, and when the header records none.
   */
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

export interface OpenReaderOptions {
  inputFilename: string;
  /**
   * The `highWaterMark` of the returned stream, and so the number of bytes
   * asked of the addon per read. Omit it to take Node's own default for a
   * {@link stream.Readable}. At most 64 MiB, since every read allocates a
   * buffer of this size.
   */
  highWaterMark?: number;
}

export interface OpenTrackReaderOptions extends OpenReaderOptions {
  mode: TrackReaderModeValue;
  trackIndex: number;
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

const bindingInstance: { binding?: ChdmanBinding } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing this
 * module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): ChdmanBinding {
  bindingInstance.binding ??= ((): ChdmanBinding => {
    if (process.env.IGIR_ADDONS !== 'wasm') {
      try {
        // Try to load the development build
        return require('./build/Release/chdman.node') as ChdmanBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-chdman/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as ChdmanBinding;
      } catch (error) {
        // The native build is required, rather than falling back to the WebAssembly build
        if (process.env.IGIR_ADDONS === 'native') {
          throw error;
        }
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-chdman/wasm/chdman.cjs') as {
      emnapiInit: (options: { context: Context }) => ChdmanBinding;
    };
    return wasmModule.emnapiInit({ context: getDefaultContext() });
  })();
  return bindingInstance.binding;
}

/**
 * Wrap a native CHD reader in a {@link stream.Readable}. The reader is closed when the
 * stream ends, errors, or is destroyed. Callers must consume the stream to its end or
 * call `destroy()` so the native reader is released.
 */
function readableFromReader(reader: NativeTrackReader, highWaterMark?: number): stream.Readable {
  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;
    reader.close();
  };
  return new stream.Readable({
    highWaterMark,
    async read(): Promise<void> {
      try {
        const chunk = await reader.read(this.readableHighWaterMark);
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
    const raw = await loadBinding().info(options.inputFilename);
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
    return await loadBinding().listTracks(
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
    return await loadBinding().listTracks(
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
    const reader = loadBinding().openTrackReader(options.inputFilename, mode, options.trackIndex);
    return readableFromReader(reader, options.highWaterMark);
  },

  /**
   * Open a {@link stream.Readable} over the full logical byte range of a RAW, HARD_DISK, or
   * DVD CHD, yielding exactly the bytes chdman's extractRaw would write.
   */
  openRawReader(options: OpenReaderOptions): stream.Readable {
    const reader = loadBinding().openRawReader(options.inputFilename);
    return readableFromReader(reader, options.highWaterMark);
  },
};
