import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import { TZValidator, ValidationResult } from '../../../../packages/torrentzip/index.js';
import { ZipReader } from '../../../../packages/zip/index.js';
import MappableSemaphore from '../../../../src/async/mappableSemaphore.js';
import FileCache from '../../../../src/cache/fileCache.js';
import Logger from '../../../../src/console/logger.js';
import { LogLevel } from '../../../../src/console/logLevel.js';
import FileFactory from '../../../../src/factories/fileFactory.js';
import Temp from '../../../../src/globals/temp.js';
import ArchiveEntry from '../../../../src/models/files/archives/archiveEntry.js';
import Zip from '../../../../src/models/files/archives/zip.js';
import type File from '../../../../src/models/files/file.js';
import { ChecksumBitmask } from '../../../../src/models/files/fileChecksums.js';
import Options, { ZipFormat } from '../../../../src/models/options.js';
import ROMScanner from '../../../../src/modules/roms/romScanner.js';
import FsUtil from '../../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new stream.PassThrough());

async function findRoms(input: string): Promise<File[]> {
  return await new ROMScanner(
    new Options({
      input: [input],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
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
      const tempFiles = await new FileFactory(new FileCache(), LOGGER).filesFrom(tempFilePath);
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
});
