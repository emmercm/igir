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

export interface Listing {
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

export interface NativeTrackReader {
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
const READER_CHUNK_SIZE = 1024 * 1024; // 1 MiB per pull

interface ChdmanBinding {
  info: (inputFilename: string) => Promise<Omit<CHDInfo, 'type'> & { type: string }>;
  listTracks: (
    inputFilename: string,
    mode: number,
    binPatternOrBase: string,
    tocName: string,
  ) => Promise<Listing>;
  openTrackReader: (inputFilename: string, mode: number, trackIndex: number) => NativeTrackReader;
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
  async listCdBinCueTracks(options: ListCdBinCueOptions): Promise<Listing> {
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
  async listGdRomTracks(options: ListGdRomOptions): Promise<Listing> {
    return await binding.listTracks(
      options.inputFilename,
      MODE_GDI,
      options.trackBaseName,
      options.gdiName,
    );
  },

  /**
   * Open a pull-based reader over a single CD-ROM (cue/bin) or GD-ROM (gdi) track,
   * yielding exactly the bytes chdman writes for that split-bin track.
   */
  async openTrackReader(options: OpenTrackReaderOptions): Promise<NativeTrackReader> {
    const mode = options.mode === 'gdi' ? MODE_GDI : MODE_CUEBIN;
    return await Promise.resolve(
      binding.openTrackReader(options.inputFilename, mode, options.trackIndex),
    );
  },

  /**
   * Open a pull-based reader over the full logical byte range of a RAW, HARD_DISK,
   * or DVD CHD, yielding exactly the bytes chdman's extractRaw would write.
   */
  async openRawReader(options: OpenRawReaderOptions): Promise<NativeTrackReader> {
    return await Promise.resolve(binding.openRawReader(options.inputFilename));
  },
};
export default exported;

/**
 * Wrap a native CHD reader in a pull-based Readable. The reader is closed when
 * the stream ends, errors, or is destroyed. Callers must consume the stream to
 * its end or call `destroy()` so the native reader is released.
 */
export function readableFromReader(reader: NativeTrackReader): stream.Readable {
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
