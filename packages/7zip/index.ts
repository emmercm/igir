import module from 'node:module';
import os from 'node:os';
import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';

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
  index: number;
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
 * {@link stream.Readable} from {@link extractEntry} instead, so nothing outside
 * this file has to pair every `read()` with a `close()`.
 */
interface NativeEntryReader {
  read: (maxBytes: number) => Promise<Buffer | null>;
  close: () => void;
}

/**
 * The native surface. Format *names* are resolved to their registration index
 * here rather than matched by name in C++, which keeps the name table -- the
 * part most likely to drift across a vendored 7-Zip upgrade -- in TypeScript.
 *
 * Entry *paths* go the other way, and deliberately. Resolving one to an index in
 * JavaScript means opening the archive to list it and then opening it again to
 * extract, whereas the addon resolves it inside the open it has to perform
 * regardless. `read()`'s argument is likewise validated in C++ (clamped to the
 * ring buffer), not here.
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
    entry: number | string,
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
 * List every entry in an archive.
 *
 * `archivePath` is a single file even when the archive spans several volumes:
 * name the first one (`.7z.001`, `.z01`, `.001`) and 7-Zip discovers its
 * siblings in the same directory. Callers never enumerate or order volumes.
 */
export async function listEntries(
  archivePath: string,
  format: SevenZipFormat,
): Promise<SevenZipEntry[]> {
  const entries = await binding.listEntries(archivePath, formatIndex(format));
  return entries.map((entry) => ({
    ...entry,
    crc32: entry.crc32?.toString(16).padStart(8, '0'),
  }));
}

/**
 * Open a {@link stream.Readable} over one entry's decompressed bytes.
 *
 * `entry` is either an index from {@link listEntries} or an entry path. A path
 * is matched with separators normalized, by the addon, against the archive it
 * opens to extract from -- naming an entry by name therefore costs nothing
 * beyond the extraction itself, and never a second pass over the archive.
 *
 * Extraction runs on a dedicated thread behind a bounded buffer, so a slow
 * consumer applies back-pressure instead of buffering the whole entry.
 *
 * The native reader is released when the stream ends, errors, or is destroyed.
 * Callers must consume the stream to its end or call `destroy()`.
 */
export function extractEntry(
  archivePath: string,
  format: SevenZipFormat,
  entry: number | string,
): stream.Readable {
  // Opening is deferred to the first read so that a failure to open surfaces as
  // an 'error' on the returned stream, which is where a caller is already
  // handling failures, rather than as a synchronous throw from this function.
  let reader: NativeEntryReader | undefined;
  const openOnce = (): NativeEntryReader => {
    reader ??= new binding.EntryReader(archivePath, formatIndex(format), entry);
    return reader;
  };

  let isClosed = false;
  const closeOnce = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    // `reader` is undefined when the stream was destroyed before the first read,
    // or when the constructor threw: either way nothing was opened to release.
    reader?.close();
  };

  return new stream.Readable({
    highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    async read(): Promise<void> {
      try {
        if (isClosed) {
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
          return;
        }
        const chunk = await openOnce().read(Defaults.FILE_READING_CHUNK_SIZE);
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
