import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import FileFactory from '../../src/factories/fileFactory.js';
import Temp from '../../src/globals/temp.js';
import type Archive from '../../src/models/files/archives/archive.js';
import ArchiveEntry from '../../src/models/files/archives/archiveEntry.js';
import Bzip2 from '../../src/models/files/archives/sevenZip/bzip2.js';
import Lzma from '../../src/models/files/archives/sevenZip/lzma.js';
import Lzma86 from '../../src/models/files/archives/sevenZip/lzma86.js';
import SevenZip from '../../src/models/files/archives/sevenZip/sevenZip.js';
import Split from '../../src/models/files/archives/sevenZip/split.js';
import Z from '../../src/models/files/archives/sevenZip/z.js';
import ZipSpanned from '../../src/models/files/archives/sevenZip/zipSpanned.js';
import Tar from '../../src/models/files/archives/tar.js';
import Zip from '../../src/models/files/archives/zip.js';
import type File from '../../src/models/files/file.js';
import { ChecksumBitmask } from '../../src/models/files/fileChecksums.js';
import FsUtil, { WalkMode } from '../../src/utils/fsUtil.js';

type ArchiveClass = new (filePath: string) => Archive;

const ROM_FIXTURE_DIR = path.join('test', 'fixtures', 'roms');
const ADDON_FIXTURE_DIR = path.join('addons', '7zip', 'test', 'fixtures');

/**
 * @returns the path of every file in a fixture directory, in a stable order
 */
async function filesIn(directory: string): Promise<string[]> {
  return (await FsUtil.walk(directory, WalkMode.FILES)).toSorted((a, b) => a.localeCompare(b));
}

/**
 * Every archive in the ROM fixture directories of the formats igir reads, except the empty and
 * invalid ones, which hold no entries.
 */
const ROM_ARCHIVES = (
  await Promise.all(
    ['7z', 'bz2', 'gz', 'nkit', 'rar', 'tar', 'zip'].map(
      async (directory) => await filesIn(path.join(ROM_FIXTURE_DIR, directory)),
    ),
  )
)
  .flat()
  .filter((file) => !/^(empty|invalid)\./.test(path.basename(file)));

// The ROM archives that hold more than one entry, by the name before their extension
const ROM_ARCHIVE_ENTRY_COUNTS = new Map([
  ['fourfive', 2],
  ['onetwothree', 3],
]);

// The class that reads the numbered parts of an archive, by the archive's extension
const SPLIT_ARCHIVE_CLASSES = new Map<string, ArchiveClass>([
  ['.7z', SevenZip],
  ['.zip', ZipSpanned],
  ['.Z', Z],
  ['.bz2', Bzip2],
  ['.lzma', Lzma],
  ['.lzma86', Lzma86],
]);

/**
 * The first part of every set of numbered parts in the addon's `split-<name>` fixture directories,
 * each sliced from the archive of the same name in `<name>`.
 */
const SPLIT_DIRECTORIES = (await FsUtil.dirs(ADDON_FIXTURE_DIR))
  .filter((directory) => path.basename(directory).startsWith('split-'))
  .toSorted((a, b) => a.localeCompare(b));
const SPLIT_ARCHIVES = (
  await Promise.all(
    SPLIT_DIRECTORIES.map(async (directory) => {
      const files = await filesIn(directory);
      return files
        .filter((file) => file.endsWith('.001'))
        .map((firstPart) => {
          const joinedName = path.parse(firstPart).name;
          const archiveClass = SPLIT_ARCHIVE_CLASSES.get(path.extname(joinedName));
          if (archiveClass === undefined) {
            throw new Error(`no archive class is mapped to the extension of fixture: ${firstPart}`);
          }
          return {
            firstPart,
            parts: files.filter((file) => path.parse(file).name === joinedName),
            joinedPath: path.join(
              ADDON_FIXTURE_DIR,
              path.basename(directory).replace(/^split-/, ''),
              joinedName,
            ),
            archiveClass,
          };
        });
    }),
  )
).flat();

// Each entry's archive class and identity, so entries of different archives compare equal
function entrySummaries(
  files: File[],
  archiveClass?: ArchiveClass,
): (File | { archiveClass: unknown; entryPath: string; size: number; crc32?: string })[] {
  return files.map((file) =>
    file instanceof ArchiveEntry
      ? {
          archiveClass: archiveClass ?? file.getArchive().constructor,
          entryPath: file.getEntryPath(),
          size: file.getSize(),
          crc32: file.getCrc32(),
        }
      : file,
  );
}

// Each file's contents, which don't depend on the name of the file they were read from
function contentSummaries(
  files: File[],
): { isArchiveEntry: boolean; size: number; crc32: string | undefined }[] {
  return files.map((file) => ({
    isArchiveEntry: file instanceof ArchiveEntry,
    size: file.getSize(),
    crc32: file.getCrc32(),
  }));
}

/**
 * Run {@link callback} against a temporary directory that is removed afterwards, however it
 * finishes.
 * @returns what {@link callback} returns
 */
async function withTempDir<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const tempDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dir'));
  await FsUtil.mkdir(tempDir, { recursive: true });
  try {
    return await callback(tempDir);
  } finally {
    await FsUtil.rm(tempDir, { force: true, recursive: true });
  }
}

describe('filesFrom', () => {
  it('should have fixtures to test', () => {
    expect([ROM_ARCHIVES.length > 0, SPLIT_ARCHIVES.length > 0]).toEqual([true, true]);
  });

  it.each(ROM_ARCHIVES)(
    'should read the entries of %s, whether its extension is valid or junk',
    async (filePath) => {
      const archiveEntries = await new FileFactory(new FileCache()).filesFrom(filePath);
      expect(contentSummaries(archiveEntries).map((file) => file.isArchiveEntry)).toEqual(
        Array.from(
          { length: ROM_ARCHIVE_ENTRY_COUNTS.get(path.basename(filePath).split('.', 1)[0]) ?? 1 },
          () => true,
        ),
      );

      await withTempDir(async (tempDir) => {
        const tempFile = path.join(tempDir, 'file');
        await FsUtil.copyFile(filePath, tempFile);
        const junkEntries = await new FileFactory(new FileCache()).filesFrom(tempFile);
        expect(contentSummaries(junkEntries)).toEqual(contentSummaries(archiveEntries));
      });
    },
  );

  it.each(
    [
      {
        filePath: path.join(ROM_FIXTURE_DIR, 'zip', 'onetwothree.zip'),
        extensions: ['.apk', '.ipa', '.jar', '.pk3', '.zip64'],
        archiveClass: Zip,
      },
      {
        filePath: path.join(ROM_FIXTURE_DIR, 'tar', 'onetwothree.tar.gz'),
        extensions: ['.ova', '.tgz', '.tpz'],
        archiveClass: Tar,
      },
      {
        filePath: path.join(ROM_FIXTURE_DIR, 'bz2', 'one.bz2'),
        extensions: ['.bzip2', '.tbz', '.tbz2'],
        archiveClass: Bzip2,
      },
    ].flatMap(({ extensions, ...fixture }) =>
      extensions.map((extension) => ({ ...fixture, extension })),
    ),
  )(
    'should read archives by their alternate extensions: $filePath as $extension',
    async ({ filePath, extension, archiveClass }) => {
      await withTempDir(async (tempDir) => {
        const tempFile = path.join(tempDir, `file${extension}`);
        await FsUtil.copyFile(filePath, tempFile);
        const archiveEntries = await new FileFactory(new FileCache()).filesFrom(tempFile);
        const originalEntries = await new FileFactory(new FileCache()).filesFrom(filePath);
        expect(
          archiveEntries.map(
            (file) => file instanceof ArchiveEntry && file.getArchive().constructor,
          ),
        ).toEqual(originalEntries.map(() => archiveClass));
      });
    },
  );

  it.each(SPLIT_ARCHIVES)(
    'should read $firstPart like the archive its numbered parts were split from',
    async ({ firstPart, joinedPath, archiveClass }) => {
      const archiveEntries = await new FileFactory(new FileCache()).filesFrom(firstPart);
      const joinedEntries = await new FileFactory(new FileCache()).filesFrom(joinedPath);
      expect(entrySummaries(archiveEntries)).toEqual(entrySummaries(joinedEntries, archiveClass));
    },
  );

  test.each(['.bin', '.rar'])(
    'should read numbered parts of a %s file as one joined file',
    async (extension) => {
      // Any set of numbered parts will do, as long as its extension is replaced
      const [{ parts, joinedPath }] = SPLIT_ARCHIVES;
      await withTempDir(async (tempDir) => {
        const copies = await Promise.all(
          parts.map(async (part) => {
            const copy = path.join(tempDir, `file${extension}${path.extname(part)}`);
            await FsUtil.copyFile(part, copy);
            return copy;
          }),
        );
        const archiveEntries = await new FileFactory(new FileCache()).filesFrom(copies[0]);
        expect(entrySummaries(archiveEntries)).toEqual([
          {
            archiveClass: Split,
            entryPath: `file${extension}`,
            size: await FsUtil.size(joinedPath),
            crc32: (
              await new FileFactory(new FileCache()).fileFrom(joinedPath, ChecksumBitmask.CRC32)
            ).getCrc32(),
          },
        ]);
      });
    },
  );
});
