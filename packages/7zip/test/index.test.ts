import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type stream from 'node:stream';
import worker_threads from 'node:worker_threads';
import zlib from 'node:zlib';

import Temp from '../../../src/globals/temp.js';
import gracefulFs from '../../../src/polyfill/gracefulFs.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import sevenZip, { SevenZipFormat } from '../index.js';

gracefulFs.gracefulify(fs);

const FIXTURE_DIR = path.join('packages', '7zip', 'test', 'fixtures');

it('should terminate workers with pending native reads and listings', async () => {
  const require = module.createRequire(import.meta.url);
  let bindingPath: string;
  try {
    bindingPath = require.resolve(
      `../addon-7zip/prebuilds/${os.platform()}-${os.arch()}/node.node`,
    );
  } catch {
    bindingPath = require.resolve('../addon-7zip/build/Release/binding.node');
  }
  for (let i = 0; i < 20; i++) {
    const worker = new worker_threads.Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       const binding = require(workerData.bindingPath);
       const format = binding.formats.findIndex((name) => name.toLowerCase() === '7z');
       const readers = Array.from({ length: 8 }, () =>
         new binding.EntryReader(workerData.archivePath, format, '8mb', undefined, 4096));
       for (const reader of readers) reader.read().catch(() => {});
       for (let j = 0; j < 8; j++) binding.listEntries(workerData.archivePath, format).catch(() => {});
       parentPort.postMessage('ready');
       setInterval(() => {}, 1000);`,
      {
        eval: true,
        workerData: {
          bindingPath,
          archivePath: path.resolve(FIXTURE_DIR, 'one-large-file/7z-lz4-level1-non-solid.7z'),
        },
      },
    );
    try {
      await events.once(worker, 'message');
    } finally {
      await worker.terminate();
    }
  }
}, 30_000);

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
 * Every archive in one fixture directory, in a stable order. Adding a fixture
 * is therefore committing the file: it joins the tests parametrized over its
 * directory with no code change, and an extension nothing maps to fails loudly
 * here rather than being silently skipped.
 */
function fixtures(directory: string): Fixture[] {
  return fs
    .readdirSync(path.join(FIXTURE_DIR, directory))
    .toSorted((a, b) => a.localeCompare(b))
    .map((file) => {
      const format = FORMATS_BY_EXTENSION.get(path.extname(file));
      if (format === undefined) {
        throw new Error(`no format is mapped to the extension of fixture: ${file}`);
      }
      return {
        label: path.join(directory, file),
        format,
        archivePath: path.join(FIXTURE_DIR, directory, file),
      };
    });
}

/**
 * Every archive holding the same four entries, `1kb` through `4kb`. The `.7z`
 * fixtures share one payload; the zstd zips carry a compressible one instead,
 * so that method 93 exercises zstd's literal and sequence decoders rather than
 * emitting raw blocks. Nothing here compares bytes across archives -- each entry
 * is checked against the CRC32 its own archive records.
 *
 * Zstd fixtures cover both ZIP method 93 and 7-Zip-zstd's registered 7z codec,
 * including solid archives where extracting a later entry decodes earlier ones.
 */
const MULTI_ENTRY_ARCHIVES = fixtures('four-small-files');

/**
 * Formats that wrap one nameless stream instead of a directory of entries. They
 * all compress the same 4 KiB payload, so one size and one CRC32 cover every one
 * of them.
 */
const SINGLE_STREAM_ARCHIVES = fixtures('one-small-file');

// The payload every single-stream fixture holds.
const SINGLE_STREAM_SIZE = 4096;
const SINGLE_STREAM_CRC32 = '266df1c3';

/**
 * Each archive holds one 8 MiB entry. LZMA2's decoder writes up to
 * 1 MiB per call into the addon's output sink, which is what lets a single
 * decoder call fill the read-ahead queue outright. Zstd exercises repeated
 * smaller writes across many compressed blocks.
 *
 * The payload is compressible on purpose -- 8 MiB in, about 1.5 KiB committed,
 * unlike the keystream payloads every other fixture uses -- but its 251-byte
 * period is position-dependent, so the bytes read back can be verified rather
 * than only counted.
 */
const LARGE_ENTRY_ARCHIVES = fixtures('one-large-file');
const LARGE_ENTRY_PATH = '8mb';
const LARGE_ENTRY_SIZE = 8 * 1024 * 1024;

/**
 * One four-entry archive of a given format, for the tests that need a valid
 * archive to damage or to mis-open rather than every archive of that shape.
 */
function multiEntryArchive(format: SevenZipFormat): string {
  const fixture = MULTI_ENTRY_ARCHIVES.find((candidate) => candidate.format === format);
  if (fixture === undefined) {
    throw new Error(`no four-entry fixture exists for format: ${format}`);
  }
  return fixture.archivePath;
}

const SEVEN_ZIP_ARCHIVE = multiEntryArchive(SevenZipFormat.SEVEN_ZIP);
const ZIP_ARCHIVE = multiEntryArchive(SevenZipFormat.ZIP);

/**
 * One single-stream archive of a given format, for the tests that need a valid
 * archive to damage rather than every archive of that shape.
 */
function singleStreamArchive(format: SevenZipFormat): string {
  const fixture = SINGLE_STREAM_ARCHIVES.find((candidate) => candidate.format === format);
  if (fixture === undefined) {
    throw new Error(`no single-stream fixture exists for format: ${format}`);
  }
  return fixture.archivePath;
}

const BZIP2_ARCHIVE = singleStreamArchive(SevenZipFormat.BZIP2);

/**
 * `four-small-files/7z-copy.7z` sliced into 4 KiB volumes by `split`. Only the
 * first slice is ever named: 7-Zip's `Split` handler derives `.002`, `.003` and
 * so on itself. Listing it yields one entry -- the slices joined back together
 * -- which is why this is not part of {@link MULTI_ENTRY_ARCHIVES} despite being
 * built from an archive that holds four, and why it keeps a directory of its own
 * rather than joining one named for the entries it does not expose.
 */
const SPLIT_FIRST_VOLUME = path.join(FIXTURE_DIR, 'split', 'copy.7z.001');
const SPLIT_JOINED = path.join(FIXTURE_DIR, 'four-small-files', '7z-copy.7z');

/**
 * A true multi-disk zip from Info-ZIP's `zip -s`, which is a different thing
 * from the byte-sliced `split/` fixture: the final disk is named `.zip` and
 * carries the central directory, the earlier ones are `.z01`/`.z02`, and the
 * first opens with the 4-byte spanning marker.
 *
 * Only the last disk is named here. It is the one holding the central
 * directory, and it is the disk 7-Zip expects to be handed; it walks back to
 * `.z01` and `.z02` through the addon's open callback.
 *
 * This keeps a directory of its own for the same reason `split/` does, with one
 * more constraint: `zip` refuses a split size below 64 KiB, so a spanned archive
 * cannot be built out of the four small files at all -- its members have to be
 * large enough to straddle a disk.
 */
const SPANNED_LAST_DISK = path.join(FIXTURE_DIR, 'spanned', 'spanned.zip');
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
 * Comfortably more than the addon's read-ahead bound, so the producer thread
 * blocks on a full queue and the queue turns over many times, while staying
 * small enough to build and drain quickly in CI.
 */
const LARGE_CONTENTS = crypto.randomBytes(8 * 1024 * 1024);

/**
 * Every chunk the stream emitted, in order. Kept separate from {@link drain}
 * because the sizes are themselves a contract -- see the high-watermark tests.
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

describe('listEntries', () => {
  it('should have fixtures to test', () => {
    expect(MULTI_ENTRY_ARCHIVES.length).toEqual(31);
    expect(SINGLE_STREAM_ARCHIVES.length).toEqual(7);
    expect(LARGE_ENTRY_ARCHIVES.length).toEqual(10);
  });

  it.each(
    MULTI_ENTRY_ARCHIVES.filter(({ label }) =>
      /7z-(?:zstd-|bcj-|bcj2-|delta-|brotli-|lz4-|lz5-|lizard-|flzma2-)|-original\.zip$/.test(
        label,
      ),
    ),
  )('should preserve the existing four-file payload in $label', async ({ format, archivePath }) => {
    const original = await sevenZip.listEntries({
      inputFilename: path.join(FIXTURE_DIR, 'four-small-files', '7z-copy.7z'),
      format: SevenZipFormat.SEVEN_ZIP,
    });
    const entries = await sevenZip.listEntries({ inputFilename: archivePath, format });
    expect(entries).toEqual(original);
  });

  it.each(MULTI_ENTRY_ARCHIVES)(
    'should list the four entries in $label',
    async ({ format, archivePath }) => {
      const entries = await sevenZip.listEntries({ inputFilename: archivePath, format });
      expect(entries.map((entry) => entry.entryPath)).toEqual(['1kb', '2kb', '3kb', '4kb']);
      expect(entries.map((entry) => entry.size)).toEqual([1024, 2048, 3072, 4096]);
      // Compared as arrays rather than collapsed with every(), so a failure
      // names the entry that disagreed instead of reporting `false !== true`.
      expect(entries.map((entry) => /^[\da-f]{8}$/.test(entry.crc32 ?? ''))).toEqual([
        true,
        true,
        true,
        true,
      ]);
      expect(entries.map((entry) => entry.isDirectory)).toEqual([false, false, false, false]);
      expect(entries.map((entry) => entry.isEncrypted)).toEqual([false, false, false, false]);
      // The archive's own item indices. They happen to match this array's
      // positions here because no entry is filtered out, which is exactly why
      // the directory case below is worth its own assertion.
      expect(entries.map((entry) => entry.entryIndex)).toEqual([0, 1, 2, 3]);
    },
  );

  it.each(SINGLE_STREAM_ARCHIVES)(
    'should list one nameless entry in $label',
    async ({ format, archivePath }) => {
      const entries = await sevenZip.listEntries({ inputFilename: archivePath, format });
      expect(entries.length).toEqual(1);
      // These fixtures record no name or CRC32. LZMA86 additionally records
      // the uncompressed size in its header.
      expect(entries[0].entryPath).toBeUndefined();
      // Undefined, not 0: these formats record no length, and 0 is a real
      // length an empty member could legitimately have.
      expect(entries[0].size).toEqual(
        format === SevenZipFormat.LZMA86 ? SINGLE_STREAM_SIZE : undefined,
      );
      expect(entries[0].crc32).toBeUndefined();
      expect(entries[0].isDirectory).toEqual(false);
      expect(entries[0].isEncrypted).toEqual(false);
      expect(entries[0].entryIndex).toEqual(0);
    },
  );

  it('should find the rest of a split set from the first volume alone', async () => {
    const entries = await sevenZip.listEntries({
      inputFilename: SPLIT_FIRST_VOLUME,
      format: SevenZipFormat.SPLIT,
    });
    expect(entries.map((entry) => entry.entryPath)).toEqual(['copy.7z']);
    expect(entries.map((entry) => entry.size)).toEqual([await FsUtil.size(SPLIT_JOINED)]);
  });

  it('should find the earlier disks of a multi-disk zip from the last alone', async () => {
    const entries = await sevenZip.listEntries({
      inputFilename: SPANNED_LAST_DISK,
      format: SevenZipFormat.ZIP,
    });
    expect(entries.map((entry) => entry.entryPath)).toEqual(
      SPANNED_ENTRIES.map((entry) => entry.entryPath),
    );
    expect(entries.map((entry) => entry.size)).toEqual(SPANNED_ENTRIES.map((entry) => entry.size));
    expect(entries.map((entry) => entry.crc32)).toEqual(
      SPANNED_ENTRIES.map((entry) => entry.crc32),
    );
  });

  it('should open a single-volume zip that carries the span marker', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'span.zip');
      await writeStoredZip(archive, 'a.txt', Buffer.from('hello span mode'), {
        hasSpanMarker: true,
      });
      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].entryPath).toEqual('a.txt');
    });
  });

  it.each([
    {
      label: 'a missing file',
      inputFilename: path.join(FIXTURE_DIR, 'nope.7z'),
      invalidMessage: /could not read/,
    },
    {
      label: 'an empty path',
      inputFilename: '',
      invalidMessage: /path or format is invalid/,
    },
    {
      label: 'a directory',
      inputFilename: FIXTURE_DIR,
      invalidMessage: /directory/i,
    },
  ])('should reject $label as a path it cannot open', async ({ inputFilename, invalidMessage }) => {
    await expect(
      sevenZip.listEntries({ inputFilename, format: SevenZipFormat.SEVEN_ZIP }),
    ).rejects.toThrow(invalidMessage);
  });

  describe.each([
    {
      format: SevenZipFormat.SEVEN_ZIP,
      invalidMessage: /is not a valid 7z archive/,
    },
    {
      format: SevenZipFormat.ZIP,
      invalidMessage: /is not a valid zip archive/,
    },
  ])('$format', ({ format, invalidMessage }) => {
    it.each([0, 4096])('should throw on %s random bytes', async (size) => {
      await withTempDir(async (directory) => {
        const garbage = path.join(directory, 'garbage');
        await FsUtil.writeFile(garbage, crypto.randomBytes(size));

        await expect(sevenZip.listEntries({ inputFilename: garbage, format })).rejects.toThrow(
          invalidMessage,
        );
      });
    });
  });

  it('should reject a 7z download cut off partway through', async () => {
    await withTempDir(async (directory) => {
      const truncated = path.join(directory, 'truncated.7z');
      const whole = await FsUtil.readFile(SEVEN_ZIP_ARCHIVE);
      await FsUtil.writeFile(truncated, whole.subarray(0, Math.floor(whole.length / 2)));
      await expect(
        sevenZip.listEntries({ inputFilename: truncated, format: SevenZipFormat.SEVEN_ZIP }),
      ).rejects.toThrow(/is not a valid 7z archive/);
    });
  });

  it.each([
    {
      label: '7z archive opened as zip',
      archivePath: SEVEN_ZIP_ARCHIVE,
      openAsFormat: SevenZipFormat.ZIP,
      invalidMessage: /is not a valid zip archive/,
    },
    {
      label: 'zip archive opened as 7z',
      archivePath: ZIP_ARCHIVE,
      openAsFormat: SevenZipFormat.SEVEN_ZIP,
      invalidMessage: /is not a valid 7z archive/,
    },
  ])(
    'should reject a real, undamaged $label',
    async ({ archivePath, openAsFormat, invalidMessage }) => {
      await expect(
        sevenZip.listEntries({ inputFilename: archivePath, format: openAsFormat }),
      ).rejects.toThrow(invalidMessage);
    },
  );

  it('should report entry paths with forward slashes whatever the archive recorded', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'backslash.zip');
      await writeStoredZip(archive, String.raw`dir\file.bin`, Buffer.from('windows-shaped name'));
      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.entryPath)).toEqual(['dir/file.bin']);
    });
  });

  it('should number directory entries alongside the files they contain', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'withdir.zip');
      await writeStoredZipEntries(archive, [
        { entryName: 'sub/', contents: Buffer.alloc(0) },
        { entryName: 'sub/file.bin', contents: Buffer.from('inside a directory') },
      ]);
      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      const files = entries.filter((entry) => !entry.isDirectory);
      expect(files.map((entry) => entry.entryPath)).toEqual(['sub/file.bin']);
      expect(files.map((entry) => entry.entryIndex)).toEqual([1]);
    });
  });

  it('should list zero entries for an archive of an empty folder', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'empty-folder.zip');
      await writeStoredZipEntries(archive, []);
      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries).toEqual([]);
    });
  });

  it('should list an archive holding only directories and no files', async () => {
    await withTempDir(async (directory) => {
      const archive = path.join(directory, 'only-dirs.zip');
      await writeStoredZipEntries(archive, [
        { entryName: 'a/', contents: Buffer.alloc(0) },
        { entryName: 'a/b/', contents: Buffer.alloc(0) },
      ]);
      const entries = await sevenZip.listEntries({
        inputFilename: archive,
        format: SevenZipFormat.ZIP,
      });
      expect(entries.map((entry) => entry.isDirectory)).toEqual([true, true]);
    });
  });

  it('should silently stop at a missing middle volume of a split set', async () => {
    // If 7-zip doesn't find the next volume in a series then it assume it's done
    await withTempDir(async (directory) => {
      await FsUtil.copyFile(SPLIT_FIRST_VOLUME, path.join(directory, 'copy.7z.001'));
      // copy.7z.002 is deliberately never copied.
      await FsUtil.copyFile(
        path.join(FIXTURE_DIR, 'split', 'copy.7z.003'),
        path.join(directory, 'copy.7z.003'),
      );

      const entries = await sevenZip.listEntries({
        inputFilename: path.join(directory, 'copy.7z.001'),
        format: SevenZipFormat.SPLIT,
      });
      const wholeFirstVolume = await FsUtil.size(path.join(directory, 'copy.7z.001'));
      expect(entries.map((entry) => entry.entryPath)).toEqual(['copy.7z']);
      // It only found and parsed copy.7z.001
      expect(entries.map((entry) => entry.size)).toEqual([wholeFirstVolume]);
      expect(wholeFirstVolume).toBeLessThan(await FsUtil.size(SPLIT_JOINED));
    });
  });

  it('should reject a split set opened from a volume other than the first', async () => {
    await expect(
      sevenZip.listEntries({
        inputFilename: path.join(FIXTURE_DIR, 'split', 'copy.7z.002'),
        format: SevenZipFormat.SPLIT,
      }),
    ).rejects.toThrow(/is not a valid split archive/);
  });
});

describe('openEntryReader', () => {
  it.each(MULTI_ENTRY_ARCHIVES)(
    'should extract every entry of $label intact',
    async ({ format, archivePath }) => {
      const entries = await sevenZip.listEntries({ inputFilename: archivePath, format });
      for (const entry of entries) {
        const extracted = await drain(
          sevenZip.openEntryReader({
            inputFilename: archivePath,
            format,
            entryPath: entry.entryPath,
          }),
        );
        expect(extracted.length).toEqual(entry.size);
        expect(crc32Hex(extracted)).toEqual(entry.crc32);
      }
    },
  );

  it.each(MULTI_ENTRY_ARCHIVES)(
    'should extract every entry of $label intact when given its index',
    async ({ format, archivePath }) => {
      const entries = await sevenZip.listEntries({ inputFilename: archivePath, format });
      for (const entry of entries) {
        const extracted = await drain(
          sevenZip.openEntryReader({
            inputFilename: archivePath,
            format,
            entryPath: entry.entryPath,
            entryIndex: entry.entryIndex,
          }),
        );
        expect(extracted.length).toEqual(entry.size);
        expect(crc32Hex(extracted)).toEqual(entry.crc32);
      }
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
    const entries = await sevenZip.listEntries({
      inputFilename: SEVEN_ZIP_ARCHIVE,
      format: SevenZipFormat.SEVEN_ZIP,
    });
    const extracted = await drain(
      sevenZip.openEntryReader({
        inputFilename: SEVEN_ZIP_ARCHIVE,
        format: SevenZipFormat.SEVEN_ZIP,
        entryPath: entries[0].entryPath,
        entryIndex,
      }),
    );
    expect(extracted.length).toEqual(entries[0].size);
    expect(crc32Hex(extracted)).toEqual(entries[0].crc32);
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
    'should reject an entry the archive does not have, given $label',
    async ({ options, rejectMessage }) => {
      await expect(
        drain(
          sevenZip.openEntryReader({
            inputFilename: SEVEN_ZIP_ARCHIVE,
            format: SevenZipFormat.SEVEN_ZIP,
            ...options,
          }),
        ),
      ).rejects.toThrow(rejectMessage);
    },
  );

  it.each(SINGLE_STREAM_ARCHIVES)(
    'should extract the stream of $label intact',
    async ({ format, archivePath }) => {
      const extracted = await drain(
        sevenZip.openEntryReader({ inputFilename: archivePath, format }),
      );
      expect(extracted.length).toEqual(SINGLE_STREAM_SIZE);
      expect(crc32Hex(extracted)).toEqual(SINGLE_STREAM_CRC32);
    },
  );

  it('should join a split set back into the original bytes', async () => {
    const extracted = await drain(
      sevenZip.openEntryReader({
        inputFilename: SPLIT_FIRST_VOLUME,
        format: SevenZipFormat.SPLIT,
        entryPath: 'copy.7z',
      }),
    );
    expect(extracted.equals(await FsUtil.readFile(SPLIT_JOINED))).toEqual(true);
  });

  it('should extract both entries across the disks of a multi-disk zip', async () => {
    const extracted = await Promise.all(
      SPANNED_ENTRIES.map(
        async ({ entryPath }) =>
          await drain(
            sevenZip.openEntryReader({
              inputFilename: SPANNED_LAST_DISK,
              format: SevenZipFormat.ZIP,
              entryPath,
            }),
          ),
      ),
    );
    expect(extracted.map((buffer) => buffer.length)).toEqual(
      SPANNED_ENTRIES.map((entry) => entry.size),
    );
    expect(extracted.map((buffer) => crc32Hex(buffer))).toEqual(
      SPANNED_ENTRIES.map((entry) => entry.crc32),
    );
  });

  it('should drain an entry larger than the read-ahead bound byte-exactly', async () => {
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
      label: 'an explicit high-water mark',
      highWaterMark: 128 * 1024,
    },
    {
      label: "Node's own default high-water mark",
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

  it('should close promptly while the producer is blocked on a full queue', async () => {
    await withLargeArchive(async (largeArchive) => {
      const readable = sevenZip.openEntryReader({
        inputFilename: largeArchive,
        format: SevenZipFormat.ZIP,
        entryPath: 'stored.bin',
      });
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);

      readable.destroy();
      await events.once(readable, 'close');
      expect(readable.destroyed).toEqual(true);
    });
  });

  it('should keep serving new streams after earlier ones are abandoned', async () => {
    await withLargeArchive(async (largeArchive) => {
      const abandoned: stream.Readable[] = [];
      for (let i = 0; i < 8; i++) {
        const readable = sevenZip.openEntryReader({
          inputFilename: largeArchive,
          format: SevenZipFormat.ZIP,
          entryPath: 'stored.bin',
        });
        abandoned.push(readable);
        const first = await readable[Symbol.asyncIterator]().next();
        expect(first.done).toEqual(false);
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
          readable.destroy();
          await events.once(readable, 'close');
        }),
      );
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

  it('should reject an entry whose compressed data is corrupt', async () => {
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
      expect(entries.map((entry) => entry.entryPath)).toEqual(['1kb', '2kb', '3kb', '4kb']);
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

  it('should reject a bzip2 download cut off partway through', async () => {
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
    'should drain $label across the read-ahead queue',
    async ({ format, archivePath }) => {
      // A regression test for a deadlock in the addon's ChunkQueue, not a
      // throughput test.
      //
      // LZMA2's decoder writes up to 1 MiB into the output sink per call, and
      // the queue's read-ahead bound is also about 1 MiB, so a single decoder
      // call can push the queue from empty to completely full. The producer
      // then parks in Write() waiting for room, and a consumer that had already
      // been told there was nothing to read parks waiting to be woken. If that
      // wake-up were sent only once Write() returned -- which on this path it
      // never does -- the two threads would wait on each other forever.
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
      // Position-dependent, so a torn or reordered queue shows up here rather
      // than passing on length alone.
      expect(
        extracted.equals(Buffer.from(Array.from({ length: LARGE_ENTRY_SIZE }, (_, i) => i % 251))),
      ).toEqual(true);
    },
    30_000,
  );
});
