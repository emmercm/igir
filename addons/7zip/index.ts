import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import { type Context, getDefaultContext } from '@emnapi/runtime';

const require = module.createRequire(import.meta.url);

/**
 * Every archive format the addon can read. These are 7-Zip's own handler names
 * lowercased.
 */
export const SevenZipFormat = {
  SEVEN_ZIP: '7z',
  ZIP: 'zip',
  Z: 'z',
  SPLIT: 'split',
  BZIP2: 'bzip2',
  LZMA: 'lzma',
  LZMA86: 'lzma86',
} as const;
export type SevenZipFormat = (typeof SevenZipFormat)[keyof typeof SevenZipFormat];

export interface SevenZipEntry {
  /**
   * The entry's position in the archive's own item table -- the number 7-Zip
   * itself uses to address it, not a position in this array. Should be provided
   * to {@link openEntryReader}.
   */
  entryIndex: number;
  /**
   * The entry's path within the archive, or `undefined` when the format records
   * no name.
   */
  entryPath: string | undefined;
  /**
   * The entry's uncompressed length, or `undefined` when the format does not
   * record one.
   */
  size: number | undefined;
  crc32: string | undefined;
  isDirectory: boolean;
  isEncrypted: boolean;
}

/**
 * The addon hands back `crc32` as a number, leaving the hex formatting to
 * TypeScript. Everything else matches {@link SevenZipEntry} exactly.
 */
interface SevenZipNativeEntry extends Omit<SevenZipEntry, 'crc32'> {
  crc32: number | undefined;
}

/**
 * The addon's pull reader.
 */
interface NativeEntryReader {
  read: () => Promise<Buffer | null>;
  close: () => void;
}

export interface ListEntriesOptions {
  inputFilename: string;
  format: SevenZipFormat;
}

export interface OpenEntryReaderOptions {
  inputFilename: string;
  format: SevenZipFormat;
  /**
   * The entry to extract, or `undefined` for the formats that record no entry
   * name. See {@link openEntryReader}.
   */
  entryPath?: string;
  /**
   * The entry's position in the archive's own item table, which is what 7zip
   * actually uses for extraction.
   */
  entryIndex?: number;
  /**
   * The `highWaterMark` of the returned stream, and so the size of every chunk
   * the addon is asked to produce. Omit it to take Node's own default for a
   * {@link stream.Readable}. At most 64 MiB, since every read allocates a
   * buffer of this size.
   */
  highWaterMark?: number;
}

interface SevenZipBinding {
  formats: string[];
  listEntries: (archivePath: string, formatIndex: number) => Promise<SevenZipNativeEntry[]>;
  EntryReader: new (
    archivePath: string,
    formatIndex: number,
    entryPath: string | undefined,
    entryIndex: number | undefined,
    chunkBytes: number,
  ) => NativeEntryReader;
}

interface LoadedSevenZip {
  binding: SevenZipBinding;
  /**
   * Handler names, lowercased, to their registration index. It is not exported:
   * callers name a format from SevenZipFormat, never an index.
   */
  formatIndices: Map<string, number>;
}

const bindingInstance: { loaded?: LoadedSevenZip } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing
 * this module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): LoadedSevenZip {
  if (bindingInstance.loaded !== undefined) {
    return bindingInstance.loaded;
  }

  const binding = ((): SevenZipBinding => {
    if (process.env.IGIR_ADDONS_WASM !== 'true') {
      try {
        // Try to load the development build
        return require('./build/Release/binding.node') as SevenZipBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-7zip/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as SevenZipBinding;
      } catch {
        // Ignored
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-7zip/wasm/binding.cjs') as {
      emnapiInit: (options: { context: Context }) => SevenZipBinding;
    };
    return wasmModule.emnapiInit({ context: getDefaultContext() });
  })();

  // The handler list is fixed at build time, so this is computed once.
  const formatIndices = new Map(
    binding.formats.map((name, index) => [name.toLowerCase(), index] as const),
  );

  // Fail at load, not at some later call, if a vendored 7-Zip upgrade renames
  // or drops a handler. Without this, the union above could silently drift out
  // of step with what the addon actually registered.
  const missingFormats = Object.values(SevenZipFormat).filter(
    (format) => !formatIndices.has(format.toLowerCase()),
  );
  if (missingFormats.length > 0) {
    throw new Error(
      `the 7-Zip addon registered no handler for: ${missingFormats.join(', ')} (it has: ${binding.formats.join(', ')})`,
    );
  }

  bindingInstance.loaded = { binding, formatIndices };
  return bindingInstance.loaded;
}

/**
 * Resolve a handler name to its registration index, the only form the addon
 * accepts.
 */
function formatIndex(format: SevenZipFormat): number {
  const index = loadBinding().formatIndices.get(format.toLowerCase());
  if (index === undefined) {
    // Unreachable via the union, but reachable from untyped JavaScript.
    throw new Error(`unknown format: ${format}`);
  }
  return index;
}

/**
 * Wrap a native 7-Zip entry reader in a {@link stream.Readable}. The reader is
 * closed when the stream ends, errors, or is destroyed. Callers must consume the
 * stream to its end or call `destroy()` so the native reader is released.
 */
function readableFromReader(
  openReader: (chunkBytes: number) => NativeEntryReader,
  highWaterMark?: number,
): stream.Readable {
  let reader: NativeEntryReader | undefined;
  const openOnce = (chunkBytes: number): NativeEntryReader => {
    reader ??= openReader(chunkBytes);
    return reader;
  };

  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    // `reader` is undefined when the stream was destroyed before the first read,
    // or when the factory threw: either way nothing was opened to release.
    reader?.close();
  };

  return new stream.Readable({
    // `undefined` is not "no opinion" to every stream option, but it is to this
    // one: Readable falls back to its own default, which is the point.
    highWaterMark,
    async read(): Promise<void> {
      try {
        if (isClosed) {
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
          return;
        }
        // Read off the stream rather than the option, so that the addon is
        // asked for exactly what the stream wants whether or not a caller named
        // a size.
        const chunk = await openOnce(this.readableHighWaterMark).read();
        if (chunk === null || chunk.length === 0) {
          closeOnce();
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
        } else {
          this.push(chunk);
        }
      } catch (error) {
        try {
          closeOnce();
        } catch {
          /* ignored: reporting the original failure matters more */
        }
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
    destroy(error, callback): void {
      try {
        closeOnce();
      } catch {
        /* ignored: releasing the reader is best-effort, and `error` is
           reported either way */
      }
      callback(error);
    },
  });
}

export default {
  /**
   * List every entry in an archive.
   *
   * `inputFilename` is a single file even when the archive spans several
   * volumes: name the first one (`.7z.001`, `.z01`, `.001`) and 7-Zip discovers
   * its siblings in the same directory. Callers never enumerate or order
   * volumes.
   */
  async listEntries(options: ListEntriesOptions): Promise<SevenZipEntry[]> {
    const entries = await loadBinding().binding.listEntries(
      options.inputFilename,
      formatIndex(options.format),
    );
    return entries.map((entry) => ({
      ...entry,
      crc32: entry.crc32?.toString(16).padStart(8, '0'),
    }));
  },

  /**
   * Open a {@link stream.Readable} over one entry's decompressed bytes.
   *
   * `entryPath` is matched against the archive the addon opens to extract from.
   *
   * `entryIndex` is an optional hint from {@link listEntries}: the addon reads
   * only that item's path and, if it is the one asked for, extracts it directly
   * instead of scanning every item's path to find it. A wrong or stale index
   * falls back to that scan, so it never changes which entry is extracted.
   */
  openEntryReader(options: OpenEntryReaderOptions): stream.Readable {
    return readableFromReader(
      (chunkBytes) =>
        new (loadBinding().binding.EntryReader)(
          options.inputFilename,
          formatIndex(options.format),
          options.entryPath,
          options.entryIndex,
          chunkBytes,
        ),
      options.highWaterMark,
    );
  },
};
