import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../src/async/driveSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ArrayPoly from '../../../src/polyfill/arrayPoly.js';
import FsPoly, { WalkMode } from '../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options, { OptionsProps } from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

function createRomScanner(input: string[], inputExclude: string[] = []): ROMScanner {
  return new ROMScanner(
    new Options({
      input,
      inputExclude,
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(os.cpus().length),
  );
}

it('should throw on nonexistent paths', async () => {
  await expect(createRomScanner(['/completely/invalid/path']).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createRomScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createRomScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(
    /no files found/i,
  );
  await expect(createRomScanner(['test/fixtures/roms/*foo*/*bar*']).scan()).rejects.toThrow(
    /no files found/i,
  );
});

it('should throw on no results', async () => {
  await expect(createRomScanner([]).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner(['']).scan()).rejects.toThrow(/no files found/i);
  await expect(createRomScanner([os.devNull]).scan()).rejects.toThrow(/no files found/i);
});

it('should not throw on bad archives', async () => {
  const invalidZips = await createRomScanner(['test/fixtures/roms/**/invalid.zip']).scan();
  expect(invalidZips).toHaveLength(2);
  for (const invalidZip of invalidZips) {
    expect(invalidZip).toBeInstanceOf(File);
    expect(invalidZip).not.toBeInstanceOf(ArchiveEntry);
  }

  const invalidRars = await createRomScanner(['test/fixtures/roms/**/invalid.rar']).scan();
  expect(invalidRars).toHaveLength(2);
  for (const invalidRar of invalidRars) {
    expect(invalidRar).toBeInstanceOf(File);
    expect(invalidRar).not.toBeInstanceOf(ArchiveEntry);
  }

  const invalidSevenZips = await createRomScanner(['test/fixtures/roms/**/invalid.7z']).scan();
  expect(invalidSevenZips).toHaveLength(2);
  for (const invalidSevenZip of invalidSevenZips) {
    expect(invalidSevenZip).toBeInstanceOf(File);
    expect(invalidSevenZip).not.toBeInstanceOf(ArchiveEntry);
  }
});

describe('multiple files', () => {
  test.each([
    [['test/fixtures/roms'], 104],
    [['test/fixtures/roms/**/*'], 104],
    [['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*.{rom,zip}'], 104],
  ])('should scan multiple files with no exclusions: %s', async (input, expectedRomFiles) => {
    await expect(createRomScanner(input).scan()).resolves.toHaveLength(expectedRomFiles);
  });

  test.each([
    [{ input: [path.join('test', 'fixtures', 'roms')] }, 150],
    [{ input: [path.join('test', 'fixtures', 'roms', '7z')] }, 13],
    [{ input: [path.join('test', 'fixtures', 'roms', 'gz')] }, 14],
    [{ input: [path.join('test', 'fixtures', 'roms', 'rar')] }, 13],
    [{ input: [path.join('test', 'fixtures', 'roms', 'tar')] }, 13],
    [{ input: [path.join('test', 'fixtures', 'roms', 'zip')] }, 16],
  ] satisfies [OptionsProps, number][])(
    'should calculate checksums of archives: %s',
    async (optionsProps, expectedRomFiles) => {
      const checksumBitmask = Object.values(ChecksumBitmask).reduce<number>(
        (allBitmasks, bitmask) => allBitmasks | bitmask,
        0,
      );
      const scannedFiles = await new ROMScanner(
        new Options(optionsProps),
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
        new DriveSemaphore(os.cpus().length),
      ).scan(checksumBitmask, true);
      expect(scannedFiles).toHaveLength(expectedRomFiles);
    },
  );

  it('should scan quickly', async () => {
    const options = new Options({
      input: [path.join('test', 'fixtures', 'roms')],
      inputChecksumQuick: true,
    });

    const scannedFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(os.cpus().length),
    ).scan(ChecksumBitmask.CRC32, false);

    const extensionsWithoutCrc32 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => !file.getCrc32())
      .map((file) => file.getArchive().getExtension())
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
    expect(extensionsWithoutCrc32).toEqual(['.chd', '.tar.gz']);

    const entriesWithMd5 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => file.getMd5() !== undefined);
    expect(entriesWithMd5).toHaveLength(0);

    const extensionsWithSha1 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => file.getSha1() !== undefined)
      .map((file) => file.getArchive().getExtension())
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
    expect(extensionsWithSha1).toEqual(['.chd', '.gcz', '.rvz', '.wia']);

    const entriesWithSha256 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => file.getSha256() !== undefined);
    expect(entriesWithSha256).toHaveLength(0);
  });

  it('should scan multiple files with some file exclusions', async () => {
    await expect(
      createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom']).scan(),
    ).resolves.toHaveLength(87);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.rom'],
      ).scan(),
    ).resolves.toHaveLength(87);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.zip'],
      ).scan(),
    ).resolves.toHaveLength(74);
  });

  it('should scan multiple files with every file excluded', async () => {
    await expect(
      createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*']).scan(),
    ).resolves.toHaveLength(0);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*'],
      ).scan(),
    ).resolves.toHaveLength(0);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/*', 'test/fixtures/roms/*/**/*'],
      ).scan(),
    ).resolves.toHaveLength(0);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*.zip', 'test/fixtures/roms/**/*'],
      ).scan(),
    ).resolves.toHaveLength(0);
  });

  it('should scan hard links', async () => {
    const scannedRealFiles = (await createRomScanner(['test/fixtures/roms']).scan()).sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    // Given some hard linked files
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const filesDir = path.join(tempDir, 'files');
      await FsPoly.mkdir(filesDir);

      const romFiles = await Promise.all(
        (await FsPoly.walk('test/fixtures/roms', WalkMode.FILES)).map(async (romFile) => {
          // Make a copy of the original file to ensure it's on the same drive
          const tempFile = path.join(filesDir, romFile);
          await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
          await FsPoly.copyFile(romFile, tempFile);
          return tempFile;
        }),
      );

      const linksDir = path.join(tempDir, 'links');
      await FsPoly.mkdir(linksDir);

      await Promise.all(
        romFiles.map(async (romFile) => {
          const tempLink = path.join(linksDir, path.relative(filesDir, romFile));
          await FsPoly.mkdir(path.dirname(tempLink), { recursive: true });
          await FsPoly.hardlink(romFile, tempLink);
        }),
      );

      // When scanning symlinked files
      const scannedSymlinks = (await createRomScanner([linksDir]).scan()).sort((a, b) =>
        a.getFilePath().localeCompare(b.getFilePath()),
      );

      // Then the files scan successfully
      expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
      for (const [idx, scannedSymlink] of scannedSymlinks.entries()) {
        expect(scannedSymlink.getSize()).toEqual(scannedRealFiles[idx].getSize());
        expect(scannedSymlink.getCrc32()).toEqual(scannedRealFiles[idx].getCrc32());
      }
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should scan symlinks', async () => {
    const scannedRealFiles = (await createRomScanner(['test/fixtures/roms']).scan()).sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    // Given some symlinked files
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const romFiles = await FsPoly.walk('test/fixtures/roms', WalkMode.FILES);
      await Promise.all(
        romFiles.map(async (romFile, idx) => {
          const tempLink = path.join(tempDir, romFile);
          await FsPoly.mkdir(path.dirname(tempLink), { recursive: true });
          if (idx % 2 === 0) {
            // symlink some files with absolute paths
            await FsPoly.symlink(path.resolve(romFile), tempLink);
          } else {
            // symlink some files with relative paths
            await FsPoly.symlink(await FsPoly.symlinkRelativePath(romFile, tempLink), tempLink);
          }
        }),
      );

      // When scanning symlinked files
      const scannedSymlinks = (await createRomScanner([tempDir]).scan()).sort((a, b) =>
        a.getFilePath().localeCompare(b.getFilePath()),
      );

      // Then the files scan successfully
      expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
      for (const [idx, scannedSymlink] of scannedSymlinks.entries()) {
        expect(scannedSymlink.getSize()).toEqual(scannedRealFiles[idx].getSize());
        expect(scannedSymlink.getCrc32()).toEqual(scannedRealFiles[idx].getCrc32());
      }
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should scan symlinked directories', async () => {
    const realRomDir = path.join('test', 'fixtures', 'roms');
    const romDirs = await FsPoly.dirs(realRomDir);

    const scannedRealFiles = (await createRomScanner(romDirs).scan()).sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    // Given some symlinked dirs
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await Promise.all(
        romDirs.map(async (romDir, idx) => {
          const tempLink = path.join(tempDir, romDir);
          await FsPoly.mkdir(path.dirname(tempLink), { recursive: true });
          if (idx % 2 === 0) {
            // symlink some files with absolute paths
            await FsPoly.symlink(path.resolve(romDir), tempLink);
          } else {
            // symlink some files with relative paths
            await FsPoly.symlink(await FsPoly.symlinkRelativePath(romDir, tempLink), tempLink);
          }
        }),
      );

      // When scanning symlink dirs
      const scannedSymlinks = (await createRomScanner([tempDir]).scan()).sort((a, b) =>
        a.getFilePath().localeCompare(b.getFilePath()),
      );

      // Then the dirs scan successfully
      expect(scannedSymlinks).toHaveLength(scannedRealFiles.length);
      for (const [idx, scannedSymlink] of scannedSymlinks.entries()) {
        expect(scannedSymlink.getSize()).toEqual(scannedRealFiles[idx].getSize());
        expect(scannedSymlink.getCrc32()).toEqual(scannedRealFiles[idx].getCrc32());
      }
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });
});

describe('single files', () => {
  it('should scan single files with no exclusions', async () => {
    await expect(createRomScanner(['test/fixtures/roms/empty.*']).scan()).resolves.toHaveLength(1);
    await expect(createRomScanner(['test/fixtures/*/empty.rom']).scan()).resolves.toHaveLength(1);
    await expect(createRomScanner(['test/fixtures/roms/empty.rom']).scan()).resolves.toHaveLength(
      1,
    );
  });
});
