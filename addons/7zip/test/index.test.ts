import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type stream from 'node:stream';
import worker_threads from 'node:worker_threads';
import zlib from 'node:zlib';

import Temp from '../../../src/globals/temp.js';
import gracefulFs from '../../../src/polyfill/gracefulFs.js';
import FsUtil, { WalkMode } from '../../../src/utils/fsUtil.js';
import PathUtil from '../../../src/utils/pathUtil.js';
import isFileOpen from '../../../test/utils/isFileOpen.js';
import sevenZip, { SevenZipFormat } from '../index.js';

gracefulFs.gracefulify(fs);

const FIXTURE_DIR = path.join('addons', '7zip', 'test', 'fixtures');

/**
 * The format each fixture's extension names. Fixtures are grouped on disk by
 * what they CONTAIN rather than by format -- that is what lets one directory
 * carry one set of expectations -- so the format has to come from the file name
 * instead of from the directory it sits in. Each name also REPEATS its format as
 * a prefix -- `bz2-level1.bz2` -- so that a mixed-format directory reads as one
 * to a person, not only to `path.extname()`.
 */
const FORMATS_BY_EXTENSION = new Map<string, SevenZipFormat>([
  ['.7z', SevenZipFormat.SEVEN_ZIP],
  ['.zip', SevenZipFormat.ZIP],
  ['.Z', SevenZipFormat.Z],
  ['.bz2', SevenZipFormat.BZIP2],
  ['.lzma', SevenZipFormat.LZMA],
  ['.lzma86', SevenZipFormat.LZMA86],
]);

interface Fixture {
  label: string;
  format: SevenZipFormat;
  archivePath: string;
}

/**
 * @returns the path of every file in one fixture directory, in a stable order
 */
async function filesIn(directory: string): Promise<string[]> {
  return (await FsUtil.walk(path.join(FIXTURE_DIR, directory), WalkMode.FILES)).toSorted((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * @returns the format {@link fileName}'s extension names, failing loudly for an
 * extension nothing maps to rather than silently skipping its fixture
 */
function formatOf(fileName: string): SevenZipFormat {
  const format = FORMATS_BY_EXTENSION.get(path.extname(fileName));
  if (format === undefined) {
    throw new Error(`no format is mapped to the extension of fixture: ${fileName}`);
  }
  return format;
}

/**
 * Every archive in one fixture directory, in a stable order. Adding a fixture
 * is therefore committing the file: it joins the tests parametrized over its
 * directory with no code change.
 */
async function fixtures(directory: string): Promise<Fixture[]> {
  return (await filesIn(directory)).map((archivePath) => ({
    label: path.relative(FIXTURE_DIR, archivePath),
    format: formatOf(archivePath),
    archivePath,
  }));
}

/**
 * Every archive holding the same four entries, `1kb` through `4kb`, with the
 * same keystream payload -- every one of them lists identically to
 * `7z-copy.7z`. The payload is incompressible, so each fixture was written by a
 * tool that keeps its named method rather than falling back to Store.
 *
 * The ZIP fixtures cover every ZIP method the addon decodes except Shrink and
 * Implode: Store (0), Deflate (8), Deflate64 (9), bzip2 (12), LZMA (14), zstd
 * (93), xz (95), and PPMd (98). Zstd fixtures cover both ZIP method 93 and
 * 7-Zip-zstd's registered 7z codec, including solid archives where extracting a
 * later entry decodes earlier ones.
 */
const MULTI_ENTRY_ARCHIVES = await fixtures('four-small-files');

// What every one of the four-file archives lists
const MULTI_ENTRIES = [
  { entryPath: '1kb', size: 1024, crc32: '6511d204' },
  { entryPath: '2kb', size: 2048, crc32: 'a81210f1' },
  { entryPath: '3kb', size: 3072, crc32: '768380d1' },
  { entryPath: '4kb', size: 4096, crc32: 'a688b0ad' },
].map((entry, entryIndex) => ({ entryIndex, ...entry, isDirectory: false, isEncrypted: false }));
const MULTI_ENTRY_PATHS = MULTI_ENTRIES.map((entry) => entry.entryPath);

/**
 * Formats that wrap one nameless stream instead of a directory of entries. They
 * all compress the same 4 KiB payload, so one size and one CRC32 cover every one
 * of them.
 */
const SINGLE_STREAM_ARCHIVES = await fixtures('one-small-file');

// The payload every single-stream fixture holds.
const SINGLE_STREAM_SIZE = 4096;
const SINGLE_STREAM_CRC32 = '266df1c3';

/**
 * Each archive holds one 8 MiB entry. LZMA2's decoder writes up to
 * 1 MiB per call into the addon's output sink, which is what lets a single
 * decoder call fill many lent buffers in a row. Zstd exercises repeated
 * smaller writes across many compressed blocks.
 *
 * The payload is compressible on purpose -- 8 MiB in, about 1.5 KiB committed,
 * unlike the keystream payloads every other fixture uses -- but its 251-byte
 * period is position-dependent, so the bytes read back can be verified rather
 * than only counted.
 */
const LARGE_ENTRY_ARCHIVES = await fixtures('one-large-file');
const LARGE_ENTRY_PATH = '8mb';
const LARGE_ENTRY_SIZE = 8 * 1024 * 1024;

/**
 * One fixture of a given format, for the tests that need a valid archive to
 * damage or to mis-open rather than every archive of that shape.
 */
function fixtureOf<F extends Fixture>(candidates: F[], format: SevenZipFormat): F {
  const fixture = candidates.find((candidate) => candidate.format === format);
  if (fixture === undefined) {
    throw new Error(`no fixture exists for format: ${format}`);
  }
  return fixture;
}

const SEVEN_ZIP_ARCHIVE = fixtureOf(MULTI_ENTRY_ARCHIVES, SevenZipFormat.SEVEN_ZIP).archivePath;
const ZIP_ARCHIVE = fixtureOf(MULTI_ENTRY_ARCHIVES, SevenZipFormat.ZIP).archivePath;
const BZIP2_ARCHIVE = fixtureOf(SINGLE_STREAM_ARCHIVES, SevenZipFormat.BZIP2).archivePath;

// A set of volumes opened from `archivePath`, which is one of them
interface VolumeSet extends Fixture {
  volumes: string[];
}

interface SplitFixture extends VolumeSet {
  // The archive the parts were sliced from
  joinedPath: string;
}

/**
 * Every set of numbered parts in every `split-<name>` fixture directory, each
 * sliced into 4 KiB parts from the archive of the same name in `<name>`, and
 * opened from its first part. Only the first part is ever named: the addon
 * finds `.002`, `.003` and so on itself. Opened with the format of the archive
 * it was sliced from, a set lists and extracts like that archive; see
 * `OpenArchive` in `src/sevenZip.h`.
 */
const SPLIT_DIRECTORIES = (await FsUtil.dirs(FIXTURE_DIR))
  .map((directory) => path.basename(directory))
  .filter((directory) => directory.startsWith('split-'))
  .toSorted((a, b) => a.localeCompare(b));
const SPLIT_ARCHIVES: SplitFixture[] = (
  await Promise.all(
    SPLIT_DIRECTORIES.map(async (directory) => {
      const files = await filesIn(directory);
      return files
        .filter((file) => file.endsWith('.001'))
        .map((firstPart) => {
          const joinedName = path.parse(firstPart).name;
          return {
            label: path.relative(FIXTURE_DIR, firstPart),
            format: formatOf(joinedName),
            archivePath: firstPart,
            volumes: files.filter((file) => path.parse(file).name === joinedName),
            joinedPath: path.join(FIXTURE_DIR, directory.replace(/^split-/, ''), joinedName),
          };
        });
    }),
  )
).flat();

/**
 * The same sets opened with 7-Zip's `Split` handler, which lists each as one
 * entry: its parts joined back together, named for the archive they were
 * sliced from.
 */
const SPLIT_SETS: SplitFixture[] = SPLIT_ARCHIVES.map((fixture) => ({
  ...fixture,
  label: `${fixture.label} as a split set`,
  format: SevenZipFormat.SPLIT,
}));

// One split set with a middle part, for the tests that need any one set
const SPLIT_SET = fixtureOf(
  SPLIT_SETS.filter((set) => set.volumes.length > 2),
  SevenZipFormat.SPLIT,
);
const SPLIT_SET_ENTRY_PATH = path.basename(SPLIT_SET.joinedPath);

/**
 * A true multi-disk zip from Info-ZIP's `zip -s`, which is a different thing
 * from the byte-sliced `split-*` fixtures: the final disk is named `.zip` and
 * carries the central directory, the earlier ones are `.z01`/`.z02`, and the
 * first opens with the 4-byte spanning marker.
 *
 * Only the last disk is named here. It is the one holding the central
 * directory, and it is the disk 7-Zip expects to be handed; it walks back to
 * `.z01` and `.z02` through the addon's open callback.
 *
 * This keeps a directory of its own because its disks are not sliced from an
 * archive of another fixture directory: `zip` refuses a split size below
 * 64 KiB, so a spanned archive cannot be built out of the four small files at
 * all -- its members have to be large enough to straddle a disk.
 */
const SPANNED_SET: VolumeSet = {
  label: 'a multi-disk zip',
  format: SevenZipFormat.ZIP,
  archivePath: path.join(FIXTURE_DIR, 'spanned', 'spanned.zip'),
  volumes: await filesIn('spanned'),
};

/**
 * Both members, in archive order. `first.bin` runs past the end of the second
 * disk, so `second.bin`'s local header begins on disk 2 and its
 * central-directory record carries `disk-number-start=2` with a local-header
 * offset relative to that disk rather than to the joined stream. Resolving that
 * pair back to an absolute offset is the arithmetic a single-member archive
 * never exercises.
 */
const SPANNED_ENTRIES = [
  { entryPath: 'first.bin', size: 140_000, crc32: '211e7a1d' },
  { entryPath: 'second.bin', size: 40_000, crc32: '9812a804' },
];

/**
 * Many times the stream's read-ahead, so the producer thread blocks waiting for
 * a buffer and is handed a new one many times over, while staying small enough
 * to build and drain quickly in CI.
 */
const LARGE_CONTENTS = crypto.randomBytes(8 * 1024 * 1024);

/**
 * Every chunk the stream emitted, in order. Kept separate from {@link drain}
 * because the sizes are themselves a contract -- see the highWaterMark tests.
 */
async function collectChunks(readable: stream.Readable): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk as Buffer);
  }
  return chunks;
}

async function drain(readable: stream.Readable): Promise<Buffer> {
  return Buffer.concat(await collectChunks(readable));
}

/**
 * Run `callback` against a temporary directory that is removed afterwards,
 * however it finishes.
 *
 * Setup and teardown are per-test and scoped by this rather than by
 * `beforeAll`/`afterAll` hooks. Vitest runs this suite shuffled, so anything two
 * tests share is state whose contents at any given moment depend on an order
 * that is deliberately not fixed; a helper that hands each test its own
 * directory has no such ordering to reason about, and the cleanup cannot be
 * skipped by a failure earlier in the file.
 */
async function withTempDir<T>(callback: (directory: string) => Promise<T> | T): Promise<T> {
  if (!(await FsUtil.exists(Temp.getTempDir()))) {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
  }
  const directory = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    return await callback(directory);
  } finally {
    await FsUtil.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Run `callback` against a freshly written stored ZIP holding
 * {@link LARGE_CONTENTS}. Stored entries need no encoder, so writing 8 MiB per
 * test costs a memcpy and a file write -- cheaper than the extraction each of
 * these tests then performs, and worth it to keep every test independent.
 */
async function withLargeArchive(callback: (archivePath: string) => Promise<void>): Promise<void> {
  await withTempDir(async (directory) => {
    const archivePath = path.join(directory, 'stored.zip');
    await writeStoredZip(archivePath, 'stored.bin', LARGE_CONTENTS);
    await callback(archivePath);
  });
}

/**
 * Copy {@link sources} into {@link directory}, keeping their names, so that a test checks the
 * handles of files that no other test, and no other process, has open.
 * @returns the paths of the copies, in the same order
 */
async function copyInto(directory: string, sources: string[]): Promise<string[]> {
  return await Promise.all(
    sources.map(async (source) => {
      const copy = path.join(directory, path.basename(source));
      await FsUtil.copyFile(source, copy);
      return copy;
    }),
  );
}

/**
 * Destroy {@link readable}, with {@link error} if one is given, and record the events it emits from
 * then on, until it closes.
 * @returns the names of the events, in the order they were emitted
 */
async function eventsAfterDestroy(readable: stream.Readable, error?: Error): Promise<string[]> {
  const emitted: string[] = [];
  const closed = new Promise<void>((resolve) => {
    for (const name of ['data', 'end', 'error', 'close']) {
      readable.on(name, () => {
        emitted.push(name);
        if (name === 'close') {
          resolve();
        }
      });
    }
  });
  readable.destroy(error);
  await closed;
  return emitted;
}

/**
 * @returns the files of {@link filePaths} that are still open, in the same order
 */
async function openFiles(filePaths: string[]): Promise<string[]> {
  const openPaths = await Promise.all(
    filePaths.map(async (filePath) => ((await isFileOpen(filePath)) ? filePath : undefined)),
  );
  return openPaths.filter((filePath) => filePath !== undefined);
}

/**
 * Write {@link volume}'s own bytes back over it through a handle opened for writing, which only
 * succeeds while every other handle to it shares writes.
 */
async function rewriteInPlace(volume: string): Promise<void> {
  const contents = await FsUtil.readFile(volume);
  const handle = await fs.promises.open(volume, 'r+');
  try {
    await handle.write(contents, 0, contents.length, 0);
  } finally {
    await handle.close();
  }
}

/**
 * Copy every volume of {@link volumeSet} into {@link directory}.
 * @returns the copies, and the copy of the volume the set is opened from
 */
async function copyVolumesInto(
  directory: string,
  volumeSet: VolumeSet,
): Promise<{ copies: string[]; inputFilename: string }> {
  return {
    copies: await copyInto(directory, volumeSet.volumes),
    inputFilename: path.join(directory, path.basename(volumeSet.archivePath)),
  };
}

// Node's crypto has no 'crc32' digest, but zlib.crc32() has been available
// since Node v20.15.0, comfortably below this package's engines floor.
function crc32Hex(buffer: Buffer): string {
  return zlib.crc32(buffer).toString(16).padStart(8, '0');
}

interface StoredZipOptions {
  /**
   * Prefix the file with NSignature::kSpan, the four bytes `zip -s` writes at
   * the front of a spanned archive. The file is otherwise a perfectly ordinary
   * single-volume ZIP -- the marker alone is what puts 7-Zip's Zip handler onto
   * its span-mode path.
   */
  hasSpanMarker?: boolean;
  /**
   * The compression method both headers declare. The payload is always written
   * verbatim, so anything other than 0 (stored) describes bytes that are not
   * what it claims -- which is the point: 7-Zip picks its decoder from this
   * number, and a number no registered codec answers to is how an archive with
   * a method this build cannot handle is produced without shipping one.
   */
  method?: number;
  /** The general-purpose bit flag both headers declare; bit 0 means encrypted. */
  flags?: number;
}

/**
 * Write a ZIP that stores every payload uncompressed (method 0). Stored entries
 * need no encoder, so a large archive can be produced here at test time rather
 * than committed as a binary fixture -- and so can a deliberately broken one, by
 * lying in the headers about what the payload is.
 */
async function writeStoredZipEntries(
  filePath: string,
  entries: { entryName: string; contents: Buffer; writtenContents?: Buffer }[],
  { hasSpanMarker = false, method = 0, flags = 0 }: StoredZipOptions = {},
): Promise<void> {
  const prefix = Buffer.alloc(hasSpanMarker ? 4 : 0);
  if (hasSpanMarker) {
    prefix.writeUInt32LE(0x08_07_4b_50, 0); // NSignature::kSpan
  }

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = prefix.length;
  for (const { entryName, contents, writtenContents = contents } of entries) {
    const name = Buffer.from(entryName, 'utf8');
    const crc = zlib.crc32(contents);
    const size = contents.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04_03_4b_50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(flags, 6); // general purpose bit flag
    localHeader.writeUInt16LE(method, 8); // compression method
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(name.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02_01_4b_50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(flags, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(method, 10); // compression method
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    // `writtenContents` is what actually lands on disk; `contents` (and so
    // `size`/`crc` above) is what the headers claim. They differ only for the
    // fixture that simulates a disk error dropping the tail of one entry's
    // bytes while every header still describes the original, undamaged file.
    locals.push(localHeader, name, writtenContents);
    centrals.push(centralHeader, name);
    offset += localHeader.length + name.length + writtenContents.length;
  }

  const centralSize = centrals.reduce((total, chunk) => total + chunk.length, 0);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06_05_4b_50, 0); // end of central directory signature
  endOfCentralDirectory.writeUInt16LE(entries.length, 8); // entries on this disk
  endOfCentralDirectory.writeUInt16LE(entries.length, 10); // entries total
  endOfCentralDirectory.writeUInt32LE(centralSize, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);

  await FsUtil.writeFile(
    filePath,
    Buffer.concat([prefix, ...locals, ...centrals, endOfCentralDirectory]),
  );
}

/**
 * {@link writeStoredZipEntries} for the common case of one entry.
 */
async function writeStoredZip(
  filePath: string,
  entryName: string,
  contents: Buffer,
  options: StoredZipOptions = {},
): Promise<void> {
  await writeStoredZipEntries(filePath, [{ entryName, contents }], options);
}

// Paths neither function can open an archive from
const UNOPENABLE_PATHS = [
  {
    label: 'a missing file',
    inputFilename: path.join(FIXTURE_DIR, 'nope.7z'),
    rejectMessage: /could not read/,
  },
  {
    label: 'an empty path',
    inputFilename: '',
    rejectMessage: /path or format is invalid/,
  },
  {
    label: 'a directory',
    inputFilename: FIXTURE_DIR,
    rejectMessage: /directory/i,
  },
];

// Files that are not archives, by the format they're opened as
const NOT_ARCHIVES = [
  { format: SevenZipFormat.SEVEN_ZIP, rejectMessage: /is not a valid 7z archive/ },
  { format: SevenZipFormat.ZIP, rejectMessage: /is not a valid zip archive/ },
].flatMap((notArchive) => [0, 4096].map((size) => ({ ...notArchive, size })));

describe('listEntries', () => {
  it('should have fixtures to test', () => {
    expect(
      [MULTI_ENTRY_ARCHIVES, SINGLE_STREAM_ARCHIVES, LARGE_ENTRY_ARCHIVES, SPLIT_ARCHIVES].map(
        (archives) => archives.length > 0,
      ),
    ).toEqual([true, true, true, true]);
  });

  it.each(MULTI_ENTRY_ARCHIVES)(
    'should list the four entries in $label, then release it',
    async ({ format, archivePath }) => {
      await withTempDir(async (directory) => {
        const [inputFilename] = await copyInto(directory, [archivePath]);
        expect(await sevenZip.listEntries({ inputFilename, format })).toEqual(MULTI_ENTRIES);
        expect(await openFiles([inputFilename])).toEqual([]);
      });
    },
  );

  it.each(SINGLE_STREAM_ARCHIVES)(
    'should list one nameless entry in $label, then release it',
    async ({ format, archivePath }) => {
      await withTempDir(async (directory) => {
        const [inputFilename] = await copyInto(directory, [archivePath]);
        expect(await sevenZip.listEntries({ inputFilename, format })).toEqual([
          {
            entryIndex: 0,
            // These fixtures record no name or CRC32
            entryPath: undefined,
            // Undefined, not 0: these formats record no length, and 0 is a real length an empty
            // member could legitimately have. LZMA86 alone records it in its header.
            size: format === SevenZipFormat.LZMA86 ? SINGLE_STREAM_SIZE : undefined,
            crc32: undefined,
            isDirectory: false,
            isEncrypted: false,
          },
        ]);
        expect(await openFiles([inputFilename])).toEqual([]);
      });
    },
  );

  it('should find the earlier disks of a multi-disk zip from the last alone, then release every disk', async () => {
    await withTempDir(async (directory) => {
      const { copies, inputFilename } = await copyVolumesInto(directory, SPANNED_SET);
      const entries = await sevenZip.listEntries({ inputFilename, format: SPANNED_SET.format });
      expect(entries.map(({ entryPath, size, crc32 }) => ({ entryPath, size, crc32 }))).toEqual(
        SPANNED_ENTRIES,
      );
      expect(await openFiles(copies)).toEqual([]);
    });
  });

  it.each(SPLIT_ARCHIVES)(
    'should list $label from the first part alone like the archive it was sliced from, then release every part',
    async (splitArchive) => {
      await withTempDir(async (directory) => {
        const { copies, inputFilename } = await copyVolumesInto(directory, splitArchive);
        const { format, joinedPath } = splitArchive;
        expect(await sevenZip.listEntries({ inputFilename, format })).toEqual(
          await sevenZip.listEntries({ inputFilename: joinedPath, format }),
        );
        expect(await openFiles(copies)).toEqual([]);
      });
    },
  );

  it.each(SPLIT_SETS)(
    'should list $label as one joined entry from the first part alone, then release every part',
    async (splitSet) => {
      await withTempDir(async (directory) => {
        const { copies, inputFilename } = await copyVolumesInto(directory, splitSet);
        expect(await sevenZip.listEntries({ inputFilename, format: splitSet.format })).toEqual([
          {
            entryIndex: 0,
            entryPath: path.basename(splitSet.joinedPath),
            size: await FsUtil.size(splitSet.joinedPath),
            crc32: undefined,
            isDirectory: false,
            isEncrypted: false,
          },
        ]);
        expect(await openFiles(copies)).toEqual([]);
      });
    },
  );

  it.each([
    {
      label: 'a single-volume zip that carries the span marker',
      entries: [{ entryName: 'a.txt', contents: Buffer.from('hello span mode') }],
      options: { hasSpanMarker: true },
      expectedEntries: [{ entryIndex: 0, entryPath: 'a.txt', isDirectory: false }],
    },
    {
      label: 'entry paths with forward slashes whatever the archive recorded',
      entries: [{ entryName: String.raw`dir\file.bin`, contents: Buffer.from('windows-shaped') }],
      expectedEntries: [{ entryIndex: 0, entryPath: 'dir/file.bin', isDirectory: false }],
    },
    {
      label: 'directory entries numbered alongside the files they contain',
      entries: [
        { entryName: 'sub/', contents: Buffer.alloc(0) },
        { entryName: 'sub/file.bin', contents: Buffer.from('inside a directory') },
      ],
      expectedEntries: [
        { entryIndex: 0, entryPath: 'sub', isDirectory: true },
        { entryIndex: 1, entryPath: 'sub/file.bin', isDirectory: false },
      ],
    },
    {
      label: 'an archive holding only directories and no files',
      entries: [
        { entryName: 'a/', contents: Buffer.alloc(0) },
        { entryName: 'a/b/', contents: Buffer.alloc(0) },
      ],
      expectedEntries: [
        { entryIndex: 0, entryPath: 'a', isDirectory: true },
        { entryIndex: 1, entryPath: 'a/b', isDirectory: true },
      ],
    },
    {
      label: 'zero entries for an archive of an empty folder',
      entries: [],
      expectedEntries: [],
    },
  ])('should list $label', async ({ entries, options, expectedEntries }) => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'written.zip');
      await writeStoredZipEntries(archive, entries, options);
      const listed = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(
        listed.map(({ entryIndex, entryPath, isDirectory }) => ({
          entryIndex,
          entryPath,
          isDirectory,
        })),
      ).toEqual(expectedEntries);
    });
  });

  it.each(UNOPENABLE_PATHS)(
    'should reject $label as a path it cannot open',
    async ({ inputFilename, rejectMessage }) => {
      await expect(
        sevenZip.listEntries({ inputFilename, format: SevenZipFormat.SEVEN_ZIP }),
      ).rejects.toThrow(rejectMessage);
    },
  );

  it.each(NOT_ARCHIVES)(
    'should reject $size random bytes as a $format archive, then release them',
    async ({ format, size, rejectMessage }) => {
      await withTempDir(async (directory) => {
        const garbage = path.join(directory, 'garbage');
        await FsUtil.writeFile(garbage, crypto.randomBytes(size));

        await expect(sevenZip.listEntries({ inputFilename: garbage, format })).rejects.toThrow(
          rejectMessage,
        );
        expect(await openFiles([garbage])).toEqual([]);
      });
    },
  );

  it('should list many archives at once, more than the thread pool has threads, then release them', async () => {
    await withTempDir(async (directory) => {
      const [inputFilename] = await copyInto(directory, [SEVEN_ZIP_ARCHIVE]);
      const listings = await Promise.all(
        Array.from(
          { length: 32 },
          async () =>
            await sevenZip.listEntries({ inputFilename, format: SevenZipFormat.SEVEN_ZIP }),
        ),
      );
      expect(listings.map((entries) => entries.map((entry) => entry.entryPath))).toEqual(
        Array.from({ length: 32 }, () => MULTI_ENTRY_PATHS),
      );
      expect(await openFiles([inputFilename])).toEqual([]);
    });
  });

  it('should keep listing after many listings of missing files fail at once', async () => {
    const results = await Promise.allSettled(
      Array.from(
        { length: 32 },
        async (_, i) =>
          await sevenZip.listEntries({
            inputFilename: path.join(FIXTURE_DIR, `nope-${i}.7z`),
            format: SevenZipFormat.SEVEN_ZIP,
          }),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toEqual(true);

    const entries = await sevenZip.listEntries({
      inputFilename: SEVEN_ZIP_ARCHIVE,
      format: SevenZipFormat.SEVEN_ZIP,
    });
    expect(entries.map((entry) => entry.entryPath)).toEqual(MULTI_ENTRY_PATHS);
  });

  it('should reject a 7z download cut off partway through, then release it', async () => {
    await withTempDir(async (directory) => {
      const truncated = path.join(directory, 'truncated.7z');
      const whole = await FsUtil.readFile(SEVEN_ZIP_ARCHIVE);
      await FsUtil.writeFile(truncated, whole.subarray(0, Math.floor(whole.length / 2)));
      await expect(
        sevenZip.listEntries({ inputFilename: truncated, format: SevenZipFormat.SEVEN_ZIP }),
      ).rejects.toThrow(/is not a valid 7z archive/);
      expect(await openFiles([truncated])).toEqual([]);
    });
  });

  it.each([
    {
      label: '7z archive opened as zip',
      archivePath: SEVEN_ZIP_ARCHIVE,
      openAsFormat: SevenZipFormat.ZIP,
      rejectMessage: /is not a valid zip archive/,
    },
    {
      label: 'zip archive opened as 7z',
      archivePath: ZIP_ARCHIVE,
      openAsFormat: SevenZipFormat.SEVEN_ZIP,
      rejectMessage: /is not a valid 7z archive/,
    },
  ])(
    'should reject a real, undamaged $label',
    async ({ archivePath, openAsFormat, rejectMessage }) => {
      await expect(
        sevenZip.listEntries({ inputFilename: archivePath, format: openAsFormat }),
      ).rejects.toThrow(rejectMessage);
    },
  );

  it('should silently stop at a missing middle volume of a split set', async () => {
    // If 7-zip doesn't find the next volume in a series then it assume it's done
    await withTempDir(async (directory) => {
      // The second volume is deliberately never copied
      const [firstVolume] = await copyInto(directory, [SPLIT_SET.volumes[0], SPLIT_SET.volumes[2]]);

      const entries = await sevenZip.listEntries({
        inputFilename: firstVolume,
        format: SPLIT_SET.format,
      });
      const wholeFirstVolume = await FsUtil.size(firstVolume);
      expect(entries.map((entry) => entry.entryPath)).toEqual([SPLIT_SET_ENTRY_PATH]);
      // It only found and parsed the first volume
      expect(entries.map((entry) => entry.size)).toEqual([wholeFirstVolume]);
      expect(wholeFirstVolume).toBeLessThan(await FsUtil.size(SPLIT_SET.joinedPath));
    });
  });

  it('should reject a split set opened from a volume other than the first', async () => {
    await expect(
      sevenZip.listEntries({
        inputFilename: SPLIT_SET.volumes[1],
        format: SPLIT_SET.format,
      }),
    ).rejects.toThrow(/is not a valid split archive/);
  });
});

describe('openEntryReader', () => {
  it.each(MULTI_ENTRY_ARCHIVES)(
    'should extract every entry of $label intact, by path alone or with its index, then release it',
    async ({ format, archivePath }) => {
      await withTempDir(async (directory) => {
        const [inputFilename] = await copyInto(directory, [archivePath]);
        for (const { entryPath, entryIndex, size, crc32 } of MULTI_ENTRIES) {
          for (const indexHint of [undefined, entryIndex]) {
            const extracted = await drain(
              sevenZip.openEntryReader({ inputFilename, format, entryPath, entryIndex: indexHint }),
            );
            expect({ size: extracted.length, crc32: crc32Hex(extracted) }).toEqual({ size, crc32 });
            expect(await openFiles([inputFilename])).toEqual([]);
          }
        }
      });
    },
  );

  it.each([
    { label: 'another entry', entryIndex: 3 },
    { label: 'past the end of the archive', entryIndex: 4096 },
    { label: 'not an integer', entryIndex: 1.5 },
    { label: 'negative', entryIndex: -1 },
  ])('should ignore an index pointing $label', async ({ entryIndex }) => {
    // Every one of these fails the path check, so the scan runs and the entry
    // named is the entry extracted. A wrong index can cost time, never bytes.
    const [{ entryPath, size, crc32 }] = MULTI_ENTRIES;
    const extracted = await drain(
      sevenZip.openEntryReader({
        inputFilename: SEVEN_ZIP_ARCHIVE,
        format: SevenZipFormat.SEVEN_ZIP,
        entryPath,
        entryIndex,
      }),
    );
    expect({ size: extracted.length, crc32: crc32Hex(extracted) }).toEqual({ size, crc32 });
  });

  it.each([
    {
      label: 'an unmatched path',
      options: { entryPath: 'nope' },
      rejectMessage: /no entry named 'nope'/,
    },
    {
      label: 'an unmatched path with a valid index',
      options: { entryPath: 'nope', entryIndex: 0 },
      rejectMessage: /no entry named 'nope'/,
    },
    {
      label: 'no name at all',
      options: {},
      rejectMessage: /no entry was named, and the archive holds 4 entries rather than one/,
    },
  ])(
    'should reject an entry the archive does not have, given $label, then release it',
    async ({ options, rejectMessage }) => {
      await withTempDir(async (directory) => {
        const [inputFilename] = await copyInto(directory, [SEVEN_ZIP_ARCHIVE]);
        await expect(
          drain(
            sevenZip.openEntryReader({
              inputFilename,
              format: SevenZipFormat.SEVEN_ZIP,
              ...options,
            }),
          ),
        ).rejects.toThrow(rejectMessage);
        expect(await openFiles([inputFilename])).toEqual([]);
      });
    },
  );

  it.each(SINGLE_STREAM_ARCHIVES)(
    'should extract the stream of $label intact, then release it',
    async ({ format, archivePath }) => {
      await withTempDir(async (directory) => {
        const [inputFilename] = await copyInto(directory, [archivePath]);
        const extracted = await drain(sevenZip.openEntryReader({ inputFilename, format }));
        expect({ size: extracted.length, crc32: crc32Hex(extracted) }).toEqual({
          size: SINGLE_STREAM_SIZE,
          crc32: SINGLE_STREAM_CRC32,
        });
        expect(await openFiles([inputFilename])).toEqual([]);
      });
    },
  );

  it.each(SPLIT_SETS)(
    'should join $label back into the archive it was sliced from, then release every part',
    async (splitSet) => {
      await withTempDir(async (directory) => {
        const { copies, inputFilename } = await copyVolumesInto(directory, splitSet);
        const extracted = await drain(
          sevenZip.openEntryReader({
            inputFilename,
            format: splitSet.format,
            entryPath: path.basename(splitSet.joinedPath),
          }),
        );
        expect(extracted.equals(await FsUtil.readFile(splitSet.joinedPath))).toEqual(true);
        expect(await openFiles(copies)).toEqual([]);
      });
    },
  );

  it.each(SPLIT_ARCHIVES)(
    'should extract every entry of $label like the archive it was sliced from, then release every part',
    async (splitArchive) => {
      await withTempDir(async (directory) => {
        const { copies, inputFilename } = await copyVolumesInto(directory, splitArchive);
        const { format, joinedPath } = splitArchive;
        const entries = await sevenZip.listEntries({ inputFilename: joinedPath, format });
        for (const { entryPath } of entries) {
          const extracted = await drain(
            sevenZip.openEntryReader({ inputFilename, format, entryPath }),
          );
          expect(
            extracted.equals(
              await drain(
                sevenZip.openEntryReader({ inputFilename: joinedPath, format, entryPath }),
              ),
            ),
          ).toEqual(true);
          expect(await openFiles(copies)).toEqual([]);
        }
      });
    },
  );

  it('should extract both entries across the disks of a multi-disk zip, then release every disk', async () => {
    await withTempDir(async (directory) => {
      const { copies, inputFilename } = await copyVolumesInto(directory, SPANNED_SET);
      const extracted = await Promise.all(
        SPANNED_ENTRIES.map(
          async ({ entryPath }) =>
            await drain(
              sevenZip.openEntryReader({ inputFilename, format: SPANNED_SET.format, entryPath }),
            ),
        ),
      );
      expect(
        extracted.map((buffer, index) => ({
          entryPath: SPANNED_ENTRIES[index].entryPath,
          size: buffer.length,
          crc32: crc32Hex(buffer),
        })),
      ).toEqual(SPANNED_ENTRIES);
      expect(await openFiles(copies)).toEqual([]);
    });
  });

  it('should drain an entry many times the read-ahead byte-exactly', async () => {
    await withLargeArchive(async (largeArchive) => {
      const entries = await sevenZip.listEntries({
        inputFilename: largeArchive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.size)).toEqual([LARGE_CONTENTS.length]);

      const extracted = await drain(
        sevenZip.openEntryReader({
          inputFilename: largeArchive,
          format: SevenZipFormat.ZIP,
          entryPath: 'stored.bin',
        }),
      );
      expect(extracted.length).toEqual(LARGE_CONTENTS.length);
      expect(crc32Hex(extracted)).toEqual(entries[0].crc32);
      expect(extracted.equals(LARGE_CONTENTS)).toEqual(true);
    });
  });

  it.each([
    {
      label: 'an explicit highWaterMark',
      highWaterMark: 128 * 1024,
    },
    {
      label: "Node's own default highWaterMark",
      highWaterMark: undefined,
    },
  ])('should emit exactly $label until the entry runs out', async ({ highWaterMark }) => {
    await withLargeArchive(async (largeArchive) => {
      const readable = sevenZip.openEntryReader({
        inputFilename: largeArchive,
        format: SevenZipFormat.ZIP,
        entryPath: 'stored.bin',
        ...(highWaterMark !== undefined && { highWaterMark }),
      });
      const expectedChunkSize = highWaterMark ?? readable.readableHighWaterMark;
      const chunks = await collectChunks(readable);
      expect(new Set(chunks.slice(0, -1).map((chunk) => chunk.length))).toEqual(
        new Set([expectedChunkSize]),
      );
      expect(chunks.at(-1)?.length).toEqual(
        LARGE_CONTENTS.length % expectedChunkSize || expectedChunkSize,
      );
      expect(Buffer.concat(chunks).equals(LARGE_CONTENTS)).toEqual(true);
    });
  });

  it('should reject a highWaterMark past 64 MiB', async () => {
    await expect(
      collectChunks(
        sevenZip.openEntryReader({
          inputFilename: SEVEN_ZIP_ARCHIVE,
          format: SevenZipFormat.SEVEN_ZIP,
          entryPath: MULTI_ENTRY_PATHS[0],
          highWaterMark: 64 * 1024 * 1024 + 1,
        }),
      ),
    ).rejects.toThrow('chunkBytes is too large');
  });

  it('should hold the archive open while the producer is blocked waiting for a buffer, and release it before emitting close when destroyed', async () => {
    await withLargeArchive(async (largeArchive) => {
      const readable = sevenZip.openEntryReader({
        inputFilename: largeArchive,
        format: SevenZipFormat.ZIP,
        entryPath: 'stored.bin',
      });
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
      expect(await openFiles([largeArchive])).toEqual([largeArchive]);

      const closed = events.once(readable, 'close');
      readable.destroy();
      await closed;
      expect(readable.destroyed).toEqual(true);
      expect(await openFiles([largeArchive])).toEqual([]);
    });
  });

  it('should keep serving new streams while more than the thread pool are abandoned at different points, and release them once destroyed', async () => {
    await withLargeArchive(async (largeArchive) => {
      // More readers than the thread pool has threads, each holding its producer blocked on
      // backpressure, so extraction occupying pool threads would starve the later opens
      const abandoned = Array.from({ length: 16 }, () =>
        sevenZip.openEntryReader({
          inputFilename: largeArchive,
          format: SevenZipFormat.ZIP,
          entryPath: 'stored.bin',
          highWaterMark: 4096,
        }),
      );
      for (const [index, readable] of abandoned.entries()) {
        const iterator = readable[Symbol.asyncIterator]();
        for (let chunks = 0; chunks < 1 + (index % 4); chunks++) {
          expect((await iterator.next()).done).toEqual(false);
        }
      }

      const extracted = await drain(
        sevenZip.openEntryReader({
          inputFilename: largeArchive,
          format: SevenZipFormat.ZIP,
          entryPath: 'stored.bin',
        }),
      );
      expect(extracted.length).toEqual(LARGE_CONTENTS.length);

      await Promise.all(
        abandoned.map(async (readable) => {
          const closed = events.once(readable, 'close');
          readable.destroy();
          await closed;
        }),
      );
      expect(await openFiles([largeArchive])).toEqual([]);
    });
  });

  it.each(UNOPENABLE_PATHS)(
    'should reject $label through the stream rather than when opened',
    async ({ inputFilename, rejectMessage }) => {
      const readable = sevenZip.openEntryReader({
        inputFilename,
        format: SevenZipFormat.SEVEN_ZIP,
        entryPath: MULTI_ENTRY_PATHS[0],
      });
      await expect(drain(readable)).rejects.toThrow(rejectMessage);
    },
  );

  it.each(NOT_ARCHIVES)(
    'should reject $size random bytes as a $format archive through the stream, then release them',
    async ({ format, size, rejectMessage }) => {
      await withTempDir(async (directory) => {
        const garbage = path.join(directory, 'garbage');
        await FsUtil.writeFile(garbage, crypto.randomBytes(size));

        await expect(
          drain(
            sevenZip.openEntryReader({
              inputFilename: garbage,
              format,
              entryPath: MULTI_ENTRY_PATHS[0],
            }),
          ),
        ).rejects.toThrow(rejectMessage);
        expect(await openFiles([garbage])).toEqual([]);
      });
    },
  );

  it('should close cleanly and release the archive when destroyed before it has opened', async () => {
    await withTempDir(async (directory) => {
      const [inputFilename] = await copyInto(directory, [SEVEN_ZIP_ARCHIVE]);
      const readables = Array.from({ length: 16 }, () =>
        sevenZip.openEntryReader({
          inputFilename,
          format: SevenZipFormat.SEVEN_ZIP,
          entryPath: '4kb',
        }),
      );
      await Promise.all(
        readables.map(async (readable) => {
          // Starts the first read, and so the open, without waiting for either
          readable.resume();
          const closed = events.once(readable, 'close');
          readable.destroy();
          await closed;
          expect(readable.destroyed).toEqual(true);
        }),
      );
      expect(await openFiles([inputFilename])).toEqual([]);

      // Nothing the abandoned opens left behind stops a later reader
      const extracted = await drain(
        sevenZip.openEntryReader({
          inputFilename,
          format: SevenZipFormat.SEVEN_ZIP,
          entryPath: '4kb',
        }),
      );
      expect(extracted.length).toEqual(4096);
    });
  });

  it('should accept an entry path spelled with either separator', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'backslash.zip');
      const contents = Buffer.from('either spelling');
      await writeStoredZip(archive, String.raw`dir\file.bin`, contents);

      const extracted = await Promise.all(
        [String.raw`dir\file.bin`, 'dir/file.bin'].map(
          async (entryPath) =>
            await drain(
              sevenZip.openEntryReader({
                inputFilename: archive,
                format: SevenZipFormat.ZIP,
                entryPath,
              }),
            ),
        ),
      );
      expect(extracted.map((buffer) => buffer.toString())).toEqual([
        contents.toString(),
        contents.toString(),
      ]);
    });
  });

  it.each([
    { label: 'accented characters', entryName: 'café résumé.txt' },
    { label: 'CJK characters', entryName: '日本語のファイル.txt' },
    { label: 'an emoji', entryName: '📦archive.txt' },
    { label: 'characters that need escaping on the shell or in a URL', entryName: "a&b#c'd.txt" },
    { label: 'a trailing space', entryName: 'trailing space .txt' },
    { label: 'a trailing dot', entryName: 'trailing.dot.' },
    {
      label: 'mixed case on what may be a case-insensitive filesystem',
      entryName: 'MiXeDcAsE.TXT',
    },
  ])('should round-trip an entry named with $label', async ({ entryName }) => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'quirky-name.zip');
      const contents = Buffer.from(`contents of ${entryName}`, 'utf8');
      await writeStoredZip(archive, entryName, contents, { flags: 0x08_00 });

      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.entryPath)).toEqual([entryName]);

      const extracted = await drain(
        sevenZip.openEntryReader({
          inputFilename: archive,
          format: SevenZipFormat.ZIP,
          entryPath: entryName,
        }),
      );
      expect(extracted.equals(contents)).toEqual(true);
    });
  });

  it.each([
    {
      label: 'to the first, by path alone',
      entryOptions: {},
      expectedContentsIndex: 0,
    },
    {
      label: 'to the second, disambiguated with an index',
      entryOptions: { entryIndex: 1 },
      expectedContentsIndex: 1,
    },
  ])(
    'should resolve a path shared by two entries $label',
    async ({ entryOptions, expectedContentsIndex }) => {
      await withTempDir(async (directory) => {
        const archive = path.join(directory, 'duplicate-name.zip');
        const contentsByEntry = [
          Buffer.from('the first one written'),
          Buffer.from('the second one written'),
        ];
        await writeStoredZipEntries(archive, [
          { entryName: 'dup.bin', contents: contentsByEntry[0] },
          { entryName: 'dup.bin', contents: contentsByEntry[1] },
        ]);

        const entries = await sevenZip.listEntries({
          inputFilename: archive,
          format: SevenZipFormat.ZIP,
        });
        expect(entries.map((entry) => entry.entryPath)).toEqual(['dup.bin', 'dup.bin']);
        expect(entries.map((entry) => entry.entryIndex)).toEqual([0, 1]);

        const extracted = await drain(
          sevenZip.openEntryReader({
            inputFilename: archive,
            format: SevenZipFormat.ZIP,
            entryPath: 'dup.bin',
            ...entryOptions,
          }),
        );
        expect(extracted.equals(contentsByEntry[expectedContentsIndex])).toEqual(true);
      });
    },
  );

  it('should reject an entry whose compressed data is corrupt, then release it', async () => {
    await withTempDir(async (directory) => {
      const corrupt = path.join(directory, 'corrupt.7z');
      const whole = Buffer.from(await FsUtil.readFile(SEVEN_ZIP_ARCHIVE));
      for (let i = 32; i < 48; i++) {
        whole[i] ^= 0x5a;
      }
      await FsUtil.writeFile(corrupt, whole);

      const entries = await sevenZip.listEntries({
        inputFilename: corrupt,
        format: SevenZipFormat.SEVEN_ZIP,
      });
      expect(entries.map((entry) => entry.entryPath)).toEqual(MULTI_ENTRY_PATHS);
      for (const entry of entries) {
        await expect(
          drain(
            sevenZip.openEntryReader({
              inputFilename: corrupt,
              format: SevenZipFormat.SEVEN_ZIP,
              entryPath: entry.entryPath,
            }),
          ),
        ).rejects.toThrow(/its compressed data is corrupt|it failed its CRC check/);
        expect(await openFiles([corrupt])).toEqual([]);
      }
    });
  });

  it('should reject an entry that is shorter on disk than its own header claims', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'shortened.zip');
      const contents = crypto.randomBytes(4096);
      await writeStoredZipEntries(archive, [
        {
          entryName: 'a.bin',
          contents,
          writtenContents: contents.subarray(0, contents.length / 2),
        },
      ]);

      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.entryPath)).toEqual(['a.bin']);
      expect(entries[0].size).toEqual(contents.length);

      await expect(
        drain(
          sevenZip.openEntryReader({
            inputFilename: archive,
            format: SevenZipFormat.ZIP,
            entryPath: 'a.bin',
          }),
        ),
      ).rejects.toThrow(
        /its compressed data is corrupt|it failed its CRC check|the archive ends before the entry does/,
      );
    });
  });

  it.each([2500, 3000])(
    'should allocate only the bytes left for the final chunk of a %d-byte entry',
    async (size) => {
      await withTempDir(async (directory) => {
        const archive = path.join(directory, 'sized.zip');
        const contents = crypto.randomBytes(size);
        await writeStoredZipEntries(archive, [{ entryName: 'a.bin', contents }]);

        const chunks = await collectChunks(
          sevenZip.openEntryReader({
            inputFilename: archive,
            format: SevenZipFormat.ZIP,
            entryPath: 'a.bin',
            highWaterMark: 1000,
          }),
        );
        expect(Buffer.concat(chunks)).toEqual(contents);
        const finalChunk = chunks.at(-1);
        expect({ length: finalChunk?.length, allocated: finalChunk?.buffer.byteLength }).toEqual({
          length: size % 1000 || 1000,
          allocated: size % 1000 || 1000,
        });
      });
    },
  );

  it('should keep reading an entry that outgrows the size it declared when opened', async () => {
    // A split set's size is summed from its volumes when it is opened, but each volume is then
    // copied to its end, so a volume that grows after that emits more than was declared
    await withTempDir(async (directory) => {
      const { copies, inputFilename } = await copyVolumesInto(directory, SPLIT_SET);
      const [lastCopy] = copies.toReversed();
      const appended = crypto.randomBytes(2500);

      const readable = sevenZip.openEntryReader({
        inputFilename,
        format: SPLIT_SET.format,
        entryPath: SPLIT_SET_ENTRY_PATH,
        highWaterMark: 1000,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        chunks.push(chunk as Buffer);
        if (chunks.length === 1) {
          // The set is open once the first chunk has arrived, and the producer is still in
          // the first volume
          await fs.promises.appendFile(lastCopy, appended);
        }
      }

      expect(Buffer.concat(chunks)).toEqual(
        Buffer.concat([await FsUtil.readFile(SPLIT_SET.joinedPath), appended]),
      );
    });
  });

  it.each([
    {
      label: 'renamed',
      change: async (volume: string): Promise<void> => {
        await FsUtil.mv(volume, `${volume}.renamed`);
      },
    },
    {
      label: 'deleted',
      change: async (volume: string): Promise<void> => {
        await FsUtil.rm(volume);
      },
    },
    {
      label: 'rewritten in place',
      change: rewriteInPlace,
    },
  ])('should keep reading a split set whose volumes are $label while open', async ({ change }) => {
    // Every volume is opened along with the set, so each is read through its open handle
    await withTempDir(async (directory) => {
      const { copies, inputFilename } = await copyVolumesInto(directory, SPLIT_SET);

      const readable = sevenZip.openEntryReader({
        inputFilename,
        format: SPLIT_SET.format,
        entryPath: SPLIT_SET_ENTRY_PATH,
        highWaterMark: 1000,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        if (!Buffer.isBuffer(chunk)) {
          throw new TypeError('expected a Buffer chunk');
        }
        chunks.push(chunk);
        if (chunks.length === 1) {
          for (const copy of copies) {
            await change(copy);
          }
        }
      }

      expect(Buffer.concat(chunks)).toEqual(await FsUtil.readFile(SPLIT_SET.joinedPath));
    });
  });

  it('should reject an entry that fails its CRC check after its final chunk, then release it', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'mismatched.zip');
      const contents = crypto.randomBytes(4096);
      // The same length as the headers claim, but not the bytes they checksum, so every chunk
      // is emitted before the CRC check fails
      const writtenContents = Buffer.from(contents);
      writtenContents[0] ^= 0xff;
      await writeStoredZipEntries(archive, [{ entryName: 'a.bin', contents, writtenContents }]);

      await expect(
        drain(
          sevenZip.openEntryReader({
            inputFilename: archive,
            format: SevenZipFormat.ZIP,
            entryPath: 'a.bin',
            highWaterMark: 1000,
          }),
        ),
      ).rejects.toThrow(/it failed its CRC check/);
      expect(await openFiles([archive])).toEqual([]);
    });
  });

  it('should reject a bzip2 download cut off partway through, then release it', async () => {
    await withTempDir(async (directory) => {
      const truncated = path.join(directory, 'truncated.bz2');
      const whole = await FsUtil.readFile(BZIP2_ARCHIVE);
      await FsUtil.writeFile(truncated, whole.subarray(0, Math.floor(whole.length / 2)));

      const entries = await sevenZip.listEntries({
        inputFilename: truncated,
        format: SevenZipFormat.BZIP2,
      });
      expect(entries.length).toEqual(1);

      await expect(
        drain(sevenZip.openEntryReader({ inputFilename: truncated, format: SevenZipFormat.BZIP2 })),
      ).rejects.toThrow(/the archive ends before the entry does, so it is truncated/);
      expect(await openFiles([truncated])).toEqual([]);
    });
  });

  it.each([
    {
      label: 'a method this build does not carry',
      writeOptions: { method: 77 }, // invalid method
      isEncrypted: false,
      rejectMessage: /its compression method is not supported by this build/,
    },
    {
      label: 'an entry with no decryptor to reach',
      writeOptions: { flags: 1 }, // encrypted
      isEncrypted: true,
      rejectMessage: /it is encrypted, and encrypted entries are not supported/,
    },
  ])('should reject $label', async ({ writeOptions, isEncrypted, rejectMessage }) => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'undecodable.zip');
      await writeStoredZip(archive, 'a.bin', Buffer.from('never decoded'), writeOptions);

      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.entryPath)).toEqual(['a.bin']);
      expect(entries.map((entry) => entry.isEncrypted)).toEqual([isEncrypted]);

      await expect(
        drain(
          sevenZip.openEntryReader({
            inputFilename: archive,
            format: SevenZipFormat.ZIP,
            entryPath: 'a.bin',
          }),
        ),
      ).rejects.toThrow(rejectMessage);
    });
  });

  it.each(LARGE_ENTRY_ARCHIVES)(
    'should drain $label across many lent buffers',
    async ({ format, archivePath }) => {
      // A regression test for a deadlock in the addon's output slot, not a
      // throughput test.
      //
      // LZMA2's decoder writes up to 1 MiB into the output sink per call, far
      // more than one lent buffer holds, so a single decoder call fills a
      // buffer and then is suspended in Write() waiting for the next, while a
      // consumer that had already been told there was nothing to read is
      // paused waiting to be woken. If that wake-up were sent only once Write()
      // returned -- which on this path it never does -- the two threads would
      // wait on each other forever.
      //
      // The archive is small but the entry is not, so the assertion that
      // matters is simply that this resolves at all. The explicit timeout is
      // what turns a regression into a failure instead of a hung suite.
      const extracted = await drain(
        sevenZip.openEntryReader({
          inputFilename: archivePath,
          format,
          entryPath: LARGE_ENTRY_PATH,
        }),
      );
      expect(extracted.length).toEqual(LARGE_ENTRY_SIZE);
      // Position-dependent, so a torn or reordered buffer shows up here rather
      // than passing on length alone.
      expect(
        extracted.equals(Buffer.from(Array.from({ length: LARGE_ENTRY_SIZE }, (_, i) => i % 251))),
      ).toEqual(true);
    },
    30_000,
  );

  it.each([...SPLIT_ARCHIVES, ...SPLIT_SETS, SPANNED_SET])(
    'should release every volume of $label once destroyed mid-read',
    async (volumeSet) => {
      await withTempDir(async (directory) => {
        const { copies, inputFilename } = await copyVolumesInto(directory, volumeSet);
        const { format } = volumeSet;
        const [{ entryPath }] = await sevenZip.listEntries({ inputFilename, format });
        const readable = sevenZip.openEntryReader({
          inputFilename,
          format,
          entryPath,
          highWaterMark: 1000,
        });
        expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);

        const closed = events.once(readable, 'close');
        readable.destroy();
        await closed;
        expect(await openFiles(copies)).toEqual([]);
      });
    },
  );

  it('should release the archive when destroyed before reading, emitting the same events as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const [inputFilename] = await copyInto(directory, [SEVEN_ZIP_ARCHIVE]);
      const expected = await eventsAfterDestroy(fs.createReadStream(inputFilename));
      expect(expected).toEqual(['close']);

      const readable = sevenZip.openEntryReader({
        inputFilename,
        format: SevenZipFormat.SEVEN_ZIP,
        entryPath: '4kb',
      });
      expect(await eventsAfterDestroy(readable)).toEqual(expected);
      expect(await openFiles([inputFilename])).toEqual([]);
    });
  });

  it('should release the archive when destroyed with a read in flight, reporting the same error as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const [inputFilename] = await copyInto(directory, [SEVEN_ZIP_ARCHIVE]);
      const error = new Error('destroyed');
      // Flowing, so each stream has its next read in flight whenever a chunk arrives
      const fileStream = fs.createReadStream(inputFilename, { highWaterMark: 1 });
      await events.once(fileStream.resume(), 'data');
      const expected = await eventsAfterDestroy(fileStream, error);
      // The chunk that the read in flight returns is dropped
      expect(expected).toEqual(['error', 'close']);

      const readable = sevenZip.openEntryReader({
        inputFilename,
        format: SevenZipFormat.SEVEN_ZIP,
        entryPath: '4kb',
        highWaterMark: 1,
      });
      await events.once(readable.resume(), 'data');
      expect(await eventsAfterDestroy(readable, error)).toEqual(expected);
      expect(readable.errored).toEqual(error);
      expect(await openFiles([inputFilename])).toEqual([]);
    });
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending native reads and listings, releasing the archive',
    async () => {
      await withTempDir(async (directory) => {
        const [archivePath] = await copyInto(directory, [
          path.join(FIXTURE_DIR, 'one-large-file', '7z-lz4-level1-non-solid.7z'),
        ]);
        for (let i = 0; i < 20; i++) {
          const worker = new worker_threads.Worker(
            `const { parentPort, workerData } = require('node:worker_threads');
           import(workerData.indexUrl).then(({ default: sevenZip, SevenZipFormat }) => {
             const options = { inputFilename: workerData.archivePath, format: SevenZipFormat.SEVEN_ZIP };
             for (let j = 0; j < 8; j++) {
               sevenZip
                 .openEntryReader({ ...options, entryPath: '8mb', highWaterMark: 4096 })
                 .on('error', () => {})
                 .resume();
               sevenZip.listEntries(options).catch(() => {});
             }
             parentPort.postMessage('ready');
             setInterval(() => {}, 1000);
           });`,
            {
              eval: true,
              workerData: {
                indexUrl: new URL('../index.ts', import.meta.url).href,
                archivePath: PathUtil.resolve(archivePath),
              },
            },
          );
          try {
            await events.once(worker, 'message');
            // Vary when the worker terminates relative to its opens and reads
            await new Promise((resolve) => setTimeout(resolve, i % 5));
          } finally {
            await worker.terminate();
          }
          // Terminating waits for the worker's environment to tear down, which waits for every
          // producer it started to exit
          expect(await openFiles([archivePath])).toEqual([]);
        }
      });
    },
    30_000,
  );
});
