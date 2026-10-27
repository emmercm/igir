import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sevenZip from '../../../../addons/7zip/index.js';
import { TZValidator, ValidationResult } from '../../../../packages/torrentzip/index.js';
import { ZipReader } from '../../../../packages/zip/index.js';
import CentralDirectoryFileHeader from '../../../../packages/zip/src/centralDirectoryFileHeader.js';
import MappableSemaphore from '../../../../src/async/mappableSemaphore.js';
import FileCache from '../../../../src/cache/fileCache.js';
import FileFactory from '../../../../src/factories/fileFactory.js';
import Temp from '../../../../src/globals/temp.js';
import ArchiveEntry from '../../../../src/models/files/archives/archiveEntry.js';
import Zip from '../../../../src/models/files/archives/zip.js';
import type File from '../../../../src/models/files/file.js';
import FileChecksums, { ChecksumBitmask } from '../../../../src/models/files/fileChecksums.js';
import Options, { ZipFormat } from '../../../../src/models/options.js';
import ROMScanner from '../../../../src/modules/roms/romScanner.js';
import FsUtil from '../../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

async function findRoms(input: string): Promise<File[]> {
  return await new ROMScanner(
    new Options({
      input: [input],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();
}

describe('createArchive', () => {
  test.each([
    './test/fixtures/roms/**/*.rom',
    './test/fixtures/roms/**/*.7z',
    './test/fixtures/roms/**/*.rar',
    './test/fixtures/roms/**/*.tar.gz',
    './test/fixtures/roms/**/*.zip',
  ])('should throw on missing input files: %s', async (input) => {
    expect.assertions(2);

    // Given a temp ROM file copied from fixtures
    const rom = (await findRoms(input)).find((file) => file.getSize() > 0);
    if (!rom) {
      throw new Error('no ROM of a non-zero size was found');
    }
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempFilePath = path.join(tempDir, path.basename(rom.getFilePath()));
      await FsUtil.copyFile(rom.getFilePath(), tempFilePath);

      // And a candidate is partially generated for that file
      const tempFiles = await new FileFactory(new FileCache()).filesFrom(tempFilePath);
      const inputToOutput = await Promise.all(
        tempFiles.map(async (tempFile) => {
          const archiveEntry = await ArchiveEntry.entryOf({
            ...tempFile,
            archive: new Zip(
              path.join(
                path.dirname(tempFile.getFilePath()),
                `${tempFile.getExtractedFilePath()}.zip`,
              ),
            ),
            entryPath: tempFile.getExtractedFilePath(),
          });
          return [tempFile, archiveEntry] as [File, ArchiveEntry<Zip>];
        }),
      );

      // And the input files have been deleted
      await Promise.all(
        inputToOutput.map(async ([tempInputFile]) => {
          await FsUtil.rm(tempInputFile.getFilePath(), { force: true });
        }),
      );

      // When the file is being zipped
      // Then any underlying exception will be re-thrown
      const zip = inputToOutput[0][1].getArchive() as Zip;
      await expect(zip.createArchive(inputToOutput, ZipFormat.TORRENTZIP, 1)).rejects.toThrow();

      // And we were able to continue
      expect(true).toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  test.each([
    './test/fixtures/roms/**/*.rom',
    './test/fixtures/roms/**/*.7z',
    './test/fixtures/roms/**/*.rar',
    './test/fixtures/roms/**/*.tar.gz',
    './test/fixtures/roms/**/*.zip',
  ])('should create TorrentZip files: %s', async (input) => {
    const romFiles = (await findRoms(input)).filter((file) => file.getSize() > 0);
    if (romFiles.length === 0) {
      throw new Error('no ROMs of a non-zero size were found');
    }

    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      for (const romFile of romFiles) {
        const tempZipPath = await FsUtil.mktemp(path.join(tempDir, 'temp.zip'));
        const tempZip = new Zip(tempZipPath);
        await tempZip.createArchive(
          [
            [
              romFile,
              await ArchiveEntry.entryOf({
                archive: tempZip,
                entryPath: path.basename(romFile.getExtractedFilePath()),
              }),
            ],
          ],
          ZipFormat.TORRENTZIP,
          1,
        );

        await expect(TZValidator.validate(new ZipReader(tempZipPath))).resolves.toEqual(
          ValidationResult.VALID_TORRENTZIP,
        );
      }
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  test.each([
    './test/fixtures/roms/**/*.rom',
    './test/fixtures/roms/**/*.7z',
    './test/fixtures/roms/**/*.rar',
    './test/fixtures/roms/**/*.tar.gz',
    './test/fixtures/roms/**/*.zip',
  ])('should create RVZSTD files: %s', async (input) => {
    const romFiles = (await findRoms(input)).filter((file) => file.getSize() > 0);
    if (romFiles.length === 0) {
      throw new Error('no ROMs of a non-zero size were found');
    }

    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      for (const romFile of romFiles) {
        const tempZipPath = await FsUtil.mktemp(path.join(tempDir, 'temp.zip'));
        const tempZip = new Zip(tempZipPath);
        await tempZip.createArchive(
          [
            [
              romFile,
              await ArchiveEntry.entryOf({
                archive: tempZip,
                entryPath: path.basename(romFile.getExtractedFilePath()),
              }),
            ],
          ],
          ZipFormat.RVZSTD,
          1,
        );

        await expect(TZValidator.validate(new ZipReader(tempZipPath))).resolves.toEqual(
          ValidationResult.VALID_RVZSTD,
        );
      }
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

const FOUR_SMALL_FILES = path.join('addons', '7zip', 'test', 'fixtures', 'four-small-files');

// The keystream payload every four-file fixture holds
const FOUR_SMALL_FILES_ENTRIES = [
  {
    entryPath: '1kb',
    size: 1024,
    crc32: '6511d204',
    sha1: '3b125ffd8e63a9fc800eda2fc976682226367ace',
  },
  {
    entryPath: '2kb',
    size: 2048,
    crc32: 'a81210f1',
    sha1: 'a4dbb77d33bb77082cf560c61ab4b2472b9a02cb',
  },
  {
    entryPath: '3kb',
    size: 3072,
    crc32: '768380d1',
    sha1: '9ad92ffc8a8c005bbda44b6589450fef2dd6ac81',
  },
  {
    entryPath: '4kb',
    size: 4096,
    crc32: 'a688b0ad',
    sha1: 'f565c7a9824090c95439da1fc8d88b2ae5ab461b',
  },
];

// Fixtures whose compression method the built-in zip reader can't decompress
const SEVEN_ZIP_ONLY_FIXTURES = [
  path.join(FOUR_SMALL_FILES, 'zip-deflate64-level9.zip'),
  path.join(FOUR_SMALL_FILES, 'zip-bzip2-level9.zip'),
  path.join(FOUR_SMALL_FILES, 'zip-lzma-level9.zip'),
  path.join(FOUR_SMALL_FILES, 'zip-xz-level9.zip'),
  path.join(FOUR_SMALL_FILES, 'zip-ppmd-level9.zip'),
];

describe('getArchiveEntries', () => {
  it('should trust the central directory CRC32 by default but recalculate it when forced', async () => {
    // Given a valid zip created from a fixture ROM
    const romFile = (await findRoms('./test/fixtures/roms/**/*.rom')).find(
      (file) => file.getSize() > 0,
    );
    if (!romFile) {
      throw new Error('no ROM of a non-zero size was found');
    }

    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempZipPath = await FsUtil.mktemp(path.join(tempDir, 'temp.zip'));
      const tempZip = new Zip(tempZipPath);
      await tempZip.createArchive(
        [
          [
            romFile,
            await ArchiveEntry.entryOf({
              archive: tempZip,
              entryPath: path.basename(romFile.getExtractedFilePath()),
            }),
          ],
        ],
        ZipFormat.TORRENTZIP,
        1,
      );

      // And we know its real (byte-computed) CRC32
      const realEntries = await new Zip(tempZipPath).getArchiveEntries(
        ChecksumBitmask.CRC32,
        undefined,
        true,
      );
      const realCrc32 = realEntries[0].getCrc32();
      expect(realCrc32).toBeDefined();

      // And the CRC32 stored in the central directory has been corrupted without touching the bytes
      const endOfCentralDirectory = await new ZipReader(tempZipPath).endOfCentralDirectoryRecord();
      const crc32Offset = endOfCentralDirectory.centralDirectoryOffset + 16;
      const buffer = await fs.promises.readFile(tempZipPath);
      buffer[crc32Offset] ^= 0xff;
      await fs.promises.writeFile(tempZipPath, buffer);

      // When reading the archive entries trusting the central directory (the default)
      const trustedEntries = await new Zip(tempZipPath).getArchiveEntries(ChecksumBitmask.CRC32);

      // Then the corrupted CRC32 is returned
      expect(trustedEntries[0].getCrc32()).not.toEqual(realCrc32);

      // When reading the archive entries forcing recalculation
      const recalculatedEntries = await new Zip(tempZipPath).getArchiveEntries(
        ChecksumBitmask.CRC32,
        undefined,
        true,
      );

      // Then the real CRC32 is recomputed from the bytes, ignoring the corrupted central directory
      expect(recalculatedEntries[0].getCrc32()).toEqual(realCrc32);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  it.each(SEVEN_ZIP_ONLY_FIXTURES)(
    'should hash entries of a compression method only 7-Zip decompresses: %s',
    async (filePath) => {
      const entries = await new Zip(filePath).getArchiveEntries(
        ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1,
        undefined,
        true,
      );

      expect(
        entries.map((entry) => ({
          entryPath: entry.getEntryPath(),
          size: entry.getSize(),
          crc32: entry.getCrc32(),
          sha1: entry.getSha1(),
        })),
      ).toEqual(FOUR_SMALL_FILES_ENTRIES);
    },
  );

  it('should not use 7-Zip for a compression method the built-in reader decompresses', async () => {
    const openEntryReaderSpy = vi.spyOn(sevenZip, 'openEntryReader');
    try {
      const entries = await new Zip(
        path.join(FOUR_SMALL_FILES, 'zip-deflate-level9.zip'),
      ).getArchiveEntries(ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1, undefined, true);

      expect(
        entries.map((entry) => ({
          entryPath: entry.getEntryPath(),
          size: entry.getSize(),
          crc32: entry.getCrc32(),
          sha1: entry.getSha1(),
        })),
      ).toEqual(FOUR_SMALL_FILES_ENTRIES);
      expect(openEntryReaderSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['zip-deflate-level9.zip', 'built-in reader'],
    ['zip-lzma-level9.zip', '7-Zip'],
  ])('should size every chunk to its entry rather than the default: %s (%s)', async (fileName) => {
    const uncompressedStreamSpy = vi.spyOn(
      CentralDirectoryFileHeader.prototype,
      'uncompressedStream',
    );
    const openEntryReaderSpy = vi.spyOn(sevenZip, 'openEntryReader');
    try {
      await new Zip(path.join(FOUR_SMALL_FILES, fileName)).getArchiveEntries(
        ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1,
        undefined,
        true,
      );

      const highWaterMarks = [
        ...uncompressedStreamSpy.mock.calls.map(([highWaterMark]) => highWaterMark),
        ...openEntryReaderSpy.mock.calls.map(([options]) => options.highWaterMark),
      ];
      expect(highWaterMarks.toSorted((left, right) => Number(left) - Number(right))).toEqual([
        1024, 2048, 3072, 4096,
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('extractEntryToFile', () => {
  it.each(SEVEN_ZIP_ONLY_FIXTURES)(
    'should extract entries of a compression method only 7-Zip decompresses: %s',
    async (filePath) => {
      const zip = new Zip(filePath);
      const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
      try {
        const extracted = await Promise.all(
          FOUR_SMALL_FILES_ENTRIES.map(async ({ entryPath }) => {
            const extractedFilePath = path.join(tempDir, entryPath);
            await zip.extractEntryToFile({ entryPath }, extractedFilePath);
            const checksums = await FileChecksums.hashFile(
              extractedFilePath,
              ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1,
            );
            return {
              entryPath,
              size: await FsUtil.size(extractedFilePath),
              crc32: checksums.crc32,
              sha1: checksums.sha1,
            };
          }),
        );

        expect(extracted).toEqual(FOUR_SMALL_FILES_ENTRIES);
      } finally {
        await FsUtil.rm(tempDir, { recursive: true, force: true });
      }
    },
  );
});
