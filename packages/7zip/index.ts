import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

const require = module.createRequire(import.meta.url);

/**
 * Every archive format the addon can read. These are 7-Zip's own handler names
 * lowercased -- upstream spells two of them `Z` and `Split`, and the lookup
 * below is case-insensitive so that callers get one uniform convention.
 *
 * The set is closed: the handlers are registered at build time by the
 * `*Register.cpp` units listed in binding.gyp, so this union is exhaustive and
 * is checked against the addon at load.
 */
export const SevenZipFormat = {
  SEVEN_ZIP: '7z',
  ZIP: 'zip',
  Z: 'z',
  /**
   * A byte-sliced file, named `.001`, `.01` or `.aa` and counting up. Listing
   * one yields a single entry: the slices joined back together. That entry is
   * usually itself an archive, which is then read with its own format.
   */
  SPLIT: 'split',
  BZIP2: 'bzip2',
  LZMA: 'lzma',
  LZMA86: 'lzma86',
} as const;
export type SevenZipFormat = (typeof SevenZipFormat)[keyof typeof SevenZipFormat];

export interface SevenZipEntry {
  /**
   * The entry's position in the archive's own item table -- the number 7-Zip
   * itself uses to address it, not a position in this array. Pass it back to
   * {@link openEntryReader} to skip the scan that finding an entry by path
   * otherwise costs.
   */
  entryIndex: number;
  /**
   * The entry's path within the archive, or `undefined` when the format records
   * no name -- `.Z`, `.bz2` and `.lzma` wrap one nameless stream, and callers
   * conventionally derive a name from the archive's own filename. Deliberately
   * not `''`, which is a name an entry could really carry.
   */
  entryPath: string | undefined;
  /**
   * The entry's uncompressed length, or `undefined` when the format does not
   * record one -- `.Z`, `.bz2` and `.lzma` store no size in their headers. This
   * is deliberately not `0`, which is a real length those formats can also hold.
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
 * The addon's pull reader. Module-private on purpose: callers get a
 * {@link stream.Readable} from {@link openEntryReader} instead, so nothing
 * outside this file has to pair every `read()` with a `close()`.
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
   * A hint: where the entry named by `entryPath` was last seen in the archive's
   * item table, from {@link SevenZipEntry.entryIndex}. It is verified against
   * `entryPath` before it is used and quietly ignored when it no longer matches,
   * so a stale one costs nothing but the scan it was meant to avoid.
   */
  entryIndex?: number;
  /**
   * The `highWaterMark` of the returned stream, and so the size of every chunk
   * the addon is asked to produce. Omit it to take Node's own default for a
   * {@link stream.Readable} -- this package deliberately defines no default of
   * its own, so a Node upgrade that retunes streams retunes this too.
   */
  highWaterMark?: number;
}

/**
 * The native surface. Format *names* are resolved to their registration index
 * here rather than matched by name in C++, which keeps the name table -- the
 * part most likely to drift across a vendored 7-Zip upgrade -- in TypeScript.
 *
 * Entry *paths* go the other way, and deliberately. Resolving one to an index in
 * JavaScript means opening the archive to list it and then opening it again to
 * extract, whereas the addon resolves it inside the open it has to perform
 * regardless. An index may accompany a path, but only ever as a hint the addon
 * verifies against that path; a path alone always resolves on its own.
 *
 * `read()` takes no size: the chunk size is fixed when the reader is
 * constructed, because it is the size the extraction thread fills to before
 * publishing anything, and so has to be known before a byte is decoded. That is
 * what makes every read but the last return exactly `chunkBytes`.
 *
 * Every path below names ONE file, even for a multi-volume archive: the addon's
 * open callback implements IArchiveOpenVolumeCallback, so 7-Zip finds the rest
 * of the set itself.
 */
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

const binding = ((): SevenZipBinding => {
  try {
    return require(
      `./addon-7zip/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    ) as SevenZipBinding;
  } catch {
    /* ignored, fall back to a local build */
  }
  return require('./build/Release/binding.node') as SevenZipBinding;
})();

// The handler list is fixed at build time, so this is computed once. It is not
// exported: callers name a format from SevenZipFormat, never an index.
const FORMAT_INDICES = new Map(
  binding.formats.map((name, index) => [name.toLowerCase(), index] as const),
);

// Fail at load, not at the first call, if a vendored 7-Zip upgrade renames or
// drops a handler. Without this the union above could silently drift out of
// step with what the addon actually registered.
const MISSING_FORMATS = Object.values(SevenZipFormat).filter(
  (format) => !FORMAT_INDICES.has(format.toLowerCase()),
);
if (MISSING_FORMATS.length > 0) {
  throw new Error(
    `the 7-Zip addon registered no handler for: ${MISSING_FORMATS.join(', ')} (it has: ${binding.formats.join(', ')})`,
  );
}

/**
 * Resolve a handler name to its registration index, the only form the addon
 * accepts.
 */
function formatIndex(format: SevenZipFormat): number {
  const index = FORMAT_INDICES.get(format.toLowerCase());
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
 *
 * Unlike the sibling addons' equivalents this takes a factory rather than an
 * already-open reader, because this addon's reader is told its chunk size when
 * it is constructed: that size is what the extraction thread fills to before
 * publishing anything, so it has to be known before a byte is decoded. Deferring
 * the open to the first read means the size can be read off the stream itself,
 * with no constant defined here to drift out of step with Node's, and it puts a
 * failure to open on the stream's 'error' -- where a caller is already handling
 * failures -- rather than making it a synchronous throw.
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
   *
   * `entryPath` is reported VERBATIM, exactly as the archive recorded it. An
   * entry written on Windows comes back with backslash separators, because that
   * is what the archive actually says; normalizing here would misreport its
   * contents, and a caller who wants a normalized form can produce one but could
   * not recover the original. Either spelling is accepted back by
   * {@link openEntryReader}.
   */
  async listEntries(options: ListEntriesOptions): Promise<SevenZipEntry[]> {
    const entries = await binding.listEntries(options.inputFilename, formatIndex(options.format));
    return entries.map((entry) => ({
      ...entry,
      crc32: entry.crc32?.toString(16).padStart(8, '0'),
    }));
  },

  /**
   * Open a {@link stream.Readable} over one entry's decompressed bytes.
   *
   * `entryPath` is matched against the archive the addon opens to extract from
   * -- naming an entry therefore costs nothing beyond the extraction itself, and
   * never a second pass over the archive. Separators are compared normalized, so
   * `dir/file.rom` and `dir\\file.rom` both find the same entry however the
   * archive spelled it. That tolerance is on input only; see {@link listEntries}
   * for what comes back out.
   *
   * `entryIndex` is an optional hint from {@link listEntries}: the addon reads
   * only that item's path and, if it is the one asked for, extracts it directly
   * instead of scanning every item's path to find it. A wrong or stale index
   * falls back to that scan, so it never changes which entry is extracted.
   *
   * Omit it for the formats that record no entry name -- `.Z`, `.bz2`, `.lzma`
   * and a split set all wrap exactly one nameless member, and {@link listEntries}
   * reports `entryPath: undefined` for it. An archive holding more than one entry
   * then rejects rather than picking one.
   *
   * Extraction runs on a dedicated thread behind a bounded buffer, so a slow
   * consumer applies back-pressure instead of buffering the whole entry.
   *
   * `highWaterMark` sets the size of every chunk the stream emits but the last.
   * The size is a promise, not a ceiling: the extraction thread accumulates
   * decompressed output and publishes a chunk only once it is full, so a consumer
   * never sees a short read merely because a decoder happened to emit its output
   * in small pieces. Only an entry's final chunk is short.
   */
  openEntryReader(options: OpenEntryReaderOptions): stream.Readable {
    return readableFromReader(
      (chunkBytes) =>
        new binding.EntryReader(
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
