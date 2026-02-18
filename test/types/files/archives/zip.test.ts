import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../../src/async/driveSemaphore.js';
import Logger from '../../../../src/console/logger.js';
import { LogLevel } from '../../../../src/console/logLevel.js';
import Temp from '../../../../src/globals/temp.js';
import ROMScanner from '../../../../src/modules/roms/romScanner.js';
import FsPoly from '../../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import type File from '../../../../src/types/files/file.js';
import FileCache from '../../../../src/types/files/fileCache.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import Options, { ZipFormat } from '../../../../src/types/options.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

async function findRoms(input: string): Promise<File[]> {
  return await new ROMScanner(
    new Options({
      input: [input],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(os.cpus().length),
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
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const tempFilePath = path.join(tempDir, path.basename(rom.getFilePath()));
      await FsPoly.copyFile(rom.getFilePath(), tempFilePath);

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
          await FsPoly.rm(tempInputFile.getFilePath(), { force: true });
        }),
      );

      // When the file is being zipped
      // Then any underlying exception will be re-thrown
      const zip = inputToOutput[0][1].getArchive() as Zip;
      await expect(zip.createArchive(inputToOutput, ZipFormat.TORRENTZIP, 1)).rejects.toThrow();

      // And we were able to continue
      expect(true).toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
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

    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      for (const romFile of romFiles) {
        const tempZipPath = await FsPoly.mktemp(path.join(tempDir, 'temp.zip'));
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

        await expect(new Zip(tempZipPath).isTorrentZip()).resolves.toEqual(true);
        await expect(new Zip(tempZipPath).isRVZSTD()).resolves.toEqual(false);
      }
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
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

    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      for (const romFile of romFiles) {
        const tempZipPath = await FsPoly.mktemp(path.join(tempDir, 'temp.zip'));
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

        await expect(new Zip(tempZipPath).isTorrentZip()).resolves.toEqual(false);
        await expect(new Zip(tempZipPath).isRVZSTD()).resolves.toEqual(true);
      }
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});
