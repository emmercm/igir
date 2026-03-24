import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
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
import type { OptionsProps } from '../../../src/types/options.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new stream.PassThrough());

function createRomScanner(input: string[], inputExclude: string[] = []): ROMScanner {
  return new ROMScanner(
    new Options({
      input,
      inputExclude,
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new MappableSemaphore(os.availableParallelism()),
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
    [['test/fixtures/roms'], 106],
    [['test/fixtures/roms/**/*'], 106],
    [['test/fixtures/roms/**/*', 'test/fixtures/roms/**/*.{rom,zip}'], 106],
  ])('should scan multiple files with no exclusions: %s', async (input, expectedRomFiles) => {
    await expect(createRomScanner(input).scan()).resolves.toHaveLength(expectedRomFiles);
  });

  test.each([
    [{ input: [path.join('test', 'fixtures', 'roms')] }, 152],
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
        new MappableSemaphore(os.availableParallelism()),
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
      new MappableSemaphore(os.availableParallelism()),
    ).scan(
      Object.values(ChecksumBitmask).reduce((accum: number, bitmask) => accum | bitmask, 0),
      false,
    );

    const extensionsWithoutCrc32 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => !file.getCrc32())
      .map((file) => file.getArchive().getExtension())
      .reduce(ArrayPoly.reduceUnique(), [])
      .toSorted();
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
      .toSorted();
    expect(extensionsWithSha1).toEqual(['.chd', '.gcz', '.rvz', '.wia']);

    const entriesWithSha256 = scannedFiles
      .filter((file) => file instanceof ArchiveEntry)
      .filter((file) => file.getSha256() !== undefined);
    expect(entriesWithSha256).toHaveLength(0);
  });

  it('should scan multiple files with some file exclusions', async () => {
    await expect(
      createRomScanner(['test/fixtures/roms/**/*'], ['test/fixtures/roms/**/*.rom']).scan(),
    ).resolves.toHaveLength(89);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.rom'],
      ).scan(),
    ).resolves.toHaveLength(89);
    await expect(
      createRomScanner(
        ['test/fixtures/roms/**/*'],
        ['test/fixtures/roms/**/*.rom', 'test/fixtures/roms/**/*.zip'],
      ).scan(),
    ).resolves.toHaveLength(76);
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
    const romDir = path.join('test', 'fixtures', 'roms');
    const scannedRealFiles = (await createRomScanner([romDir]).scan())
      .map((file) => [file.toString(), file.getCrc32() ?? ''])
      .toSorted((a, b) => a[0].localeCompare(b[0]));

    // Given some hard linked files
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const filesDir = path.join(tempDir, 'files');
      await FsPoly.mkdir(filesDir);

      const romFiles = await Promise.all(
        (await FsPoly.walk(romDir, WalkMode.FILES)).map(async (romFile) => {
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
      const scannedHardLinks = (await createRomScanner([linksDir]).scan())
        .map((file) => [file.toString().replace(linksDir + path.sep, ''), file.getCrc32() ?? ''])
        .toSorted((a, b) => a[0].localeCompare(b[0]));

      // Then the files scan successfully
      expect(scannedHardLinks).toEqual(scannedRealFiles);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should scan symlinks', async () => {
    const romDir = path.join('test', 'fixtures', 'roms');
    const scannedRealFiles = (await createRomScanner([romDir]).scan())
      .map((file) => [file.toString(), file.getCrc32() ?? ''])
      .toSorted((a, b) => a[0].localeCompare(b[0]));

    // Given some symlinked files
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const romFiles = await FsPoly.walk(romDir, WalkMode.FILES);
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
      const scannedSymlinks = (await createRomScanner([tempDir]).scan())
        .map((file) => [
          file
            .toString()
            .replace(tempDir + path.sep, '')
            .replace(/ -> .+$/, ''),
          file.getCrc32() ?? '',
        ])
        .toSorted((a, b) => a[0].localeCompare(b[0]));

      // Then the files scan successfully
      expect(scannedSymlinks).toEqual(scannedRealFiles);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should scan symlinked directories', async () => {
    const realRomDir = path.join('test', 'fixtures', 'roms');
    const romDirs = await FsPoly.dirs(realRomDir);

    const scannedRealFiles = (await createRomScanner(romDirs).scan())
      .map((file) => [file.toString(), file.getCrc32() ?? ''])
      .toSorted((a, b) => a[0].localeCompare(b[0]));

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
      const scannedSymlinks = (await createRomScanner([tempDir]).scan())
        .map((file) => [file.toString().replace(tempDir + path.sep, ''), file.getCrc32() ?? ''])
        .toSorted((a, b) => a[0].localeCompare(b[0]));

      // Then the dirs scan successfully
      expect(scannedSymlinks).toEqual(scannedRealFiles);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });
});

describe('checksum constraining', () => {
  it('should return only CRC32 when only CRC32 is requested', async () => {
    const scannedFiles = await new ROMScanner(
      new Options({ input: [path.join('test', 'fixtures', 'roms', 'raw')] }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(ChecksumBitmask.CRC32);

    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) {
      expect(file.getCrc32()).toBeDefined();
      expect(file.getMd5()).toBeUndefined();
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha256()).toBeUndefined();
    }
  });

  it('should return only MD5 when only MD5 is requested', async () => {
    const scannedFiles = await new ROMScanner(
      new Options({ input: [path.join('test', 'fixtures', 'roms', 'raw')] }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(ChecksumBitmask.MD5);

    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) {
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getMd5()).toBeDefined();
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha256()).toBeUndefined();
    }
  });

  it('should return only SHA1 when only SHA1 is requested', async () => {
    const scannedFiles = await new ROMScanner(
      new Options({ input: [path.join('test', 'fixtures', 'roms', 'raw')] }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(ChecksumBitmask.SHA1);

    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) {
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getMd5()).toBeUndefined();
      expect(file.getSha1()).toBeDefined();
      expect(file.getSha256()).toBeUndefined();
    }
  });

  it('should return only SHA256 when only SHA256 is requested', async () => {
    const scannedFiles = await new ROMScanner(
      new Options({ input: [path.join('test', 'fixtures', 'roms', 'raw')] }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(ChecksumBitmask.SHA256);

    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) {
      expect(file.getCrc32()).toBeUndefined();
      expect(file.getMd5()).toBeUndefined();
      expect(file.getSha1()).toBeUndefined();
      expect(file.getSha256()).toBeDefined();
    }
  });

  it('should return all checksums when all are requested', async () => {
    const allBitmasks = Object.values(ChecksumBitmask).reduce<number>(
      (accum, bitmask) => accum | bitmask,
      0,
    );
    const scannedFiles = await new ROMScanner(
      new Options({ input: [path.join('test', 'fixtures', 'roms', 'raw')] }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(allBitmasks);

    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) {
      expect(file.getCrc32()).toBeDefined();
      expect(file.getMd5()).toBeDefined();
      expect(file.getSha1()).toBeDefined();
      expect(file.getSha256()).toBeDefined();
    }
  });

  it('should not constrain archive entries when using quick checksums', async () => {
    // Quick checksums read CRC32 from archive central directories rather than hashing content.
    // Those archive entries must NOT be constrained so that the free CRC32 is preserved.
    const scannedFiles = await new ROMScanner(
      new Options({
        input: [path.join('test', 'fixtures', 'roms', 'zip')],
        inputChecksumQuick: true,
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan(ChecksumBitmask.MD5);

    const archiveEntries = scannedFiles.filter((file) => file instanceof ArchiveEntry);
    expect(archiveEntries.length).toBeGreaterThan(0);

    // CRC32 should be preserved from the ZIP central directory even though MD5 was requested
    const entriesWithCrc32 = archiveEntries.filter((file) => file.getCrc32() !== undefined);
    expect(entriesWithCrc32.length).toBeGreaterThan(0);

    // MD5 should be absent since quick mode skips hashing archive entry contents
    const entriesWithMd5 = archiveEntries.filter((file) => file.getMd5() !== undefined);
    expect(entriesWithMd5).toHaveLength(0);
  });
});

describe('output directory scanning', () => {
  it('should not scan the output directory when no relevant commands are used', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const inputDir = path.join(tempDir, 'input');
      const outputDir = path.join(tempDir, 'output');
      await FsPoly.mkdir(inputDir);
      await FsPoly.mkdir(outputDir);

      await FsPoly.copyFile(
        path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'),
        path.join(inputDir, 'fizzbuzz.nes'),
      );
      await FsPoly.copyFile(
        path.join('test', 'fixtures', 'roms', 'raw', 'loremipsum.rom'),
        path.join(outputDir, 'loremipsum.rom'),
      );

      const files = await new ROMScanner(
        new Options({ input: [inputDir], commands: ['copy'], output: outputDir }),
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
        new MappableSemaphore(os.availableParallelism()),
      ).scan();

      // Only input files should be returned; output dir is not scanned
      expect(files).toHaveLength(1);
      expect(files.every((f) => f.getCanBeCandidateInput())).toBe(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it.each(['playlist', 'report', 'clean'])(
    'should mark output-only files as isOutputFile: %s',
    async (command) => {
      const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
      try {
        const inputDir = path.join(tempDir, 'input');
        const outputDir = path.join(tempDir, 'output');
        await FsPoly.mkdir(inputDir);
        await FsPoly.mkdir(outputDir);

        await FsPoly.copyFile(
          path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'),
          path.join(inputDir, 'fizzbuzz.nes'),
        );
        await FsPoly.copyFile(
          path.join('test', 'fixtures', 'roms', 'raw', 'loremipsum.rom'),
          path.join(outputDir, 'loremipsum.rom'),
        );

        const files = await new ROMScanner(
          new Options({ input: [inputDir], commands: ['copy', command], output: outputDir }),
          new ProgressBarFake(),
          new FileFactory(new FileCache(), LOGGER),
          new MappableSemaphore(os.availableParallelism()),
        ).scan();

        const inputFiles = files.filter((f) => f.getCanBeCandidateInput());
        const outputFiles = files.filter((f) => !f.getCanBeCandidateInput());
        expect(inputFiles).toHaveLength(1);
        expect(outputFiles).toHaveLength(1);
        expect(outputFiles[0].getFilePath()).toContain('loremipsum.rom');
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    },
  );

  it('should not add output files that are already in the input paths', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      // Output dir is nested inside the input scan area
      const outputDir = path.join(tempDir, 'output');
      await FsPoly.mkdir(outputDir);

      await FsPoly.copyFile(
        path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'),
        path.join(outputDir, 'fizzbuzz.nes'),
      );

      const files = await new ROMScanner(
        // Input covers the whole tempDir (including the output subdir)
        new Options({ input: [tempDir], commands: ['copy', 'clean'], output: outputDir }),
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
        new MappableSemaphore(os.availableParallelism()),
      ).scan();

      // File appears only once (path already in input set, not re-added from output)
      expect(files).toHaveLength(1);
      expect(files[0].getCanBeCandidateInput()).toBe(true);
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
