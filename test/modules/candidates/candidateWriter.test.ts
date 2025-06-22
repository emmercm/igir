import 'jest-extended';

import fs, { Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import CandidateCombiner from '../../../src/modules/candidates/candidateCombiner.js';
import CandidateExtensionCorrector from '../../../src/modules/candidates/candidateExtensionCorrector.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import CandidatePatchGenerator from '../../../src/modules/candidates/candidatePatchGenerator.js';
import CandidateWriter from '../../../src/modules/candidates/candidateWriter.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import PatchScanner from '../../../src/modules/patchScanner.js';
import ROMHeaderProcessor from '../../../src/modules/roms/romHeaderProcessor.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import DAT from '../../../src/types/dats/dat.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import Archive from '../../../src/types/files/archives/archive.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options, {
  GameSubdirMode,
  GameSubdirModeInverted,
  OptionsProps,
  ZipFormat,
  ZipFormatInverted,
} from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
): Promise<void> {
  // Set up the input directory
  const inputTemp = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'input'));
  await FsPoly.copyDir('./test/fixtures', inputTemp);

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'output'));
  await FsPoly.rm(outputTemp, { force: true, recursive: true });

  try {
    // Call the callback
    await callback(inputTemp, outputTemp);
  } finally {
    // Delete the temp files
    await FsPoly.rm(inputTemp, { recursive: true });
    await FsPoly.rm(outputTemp, { force: true, recursive: true });
  }
}

async function walkAndStat(dirPath: string): Promise<[string, Stats][]> {
  if (!(await FsPoly.exists(dirPath))) {
    return [];
  }

  return Promise.all(
    (await FsPoly.walk(dirPath)).sort().map(async (filePath) => {
      const stats = await fs.promises.lstat(filePath);
      // Hard-code properties that can change with file reads
      stats.atime = new Date(0);
      stats.atimeMs = 0;
      // Hard-code properties that can change with hard-linking
      stats.ctime = new Date(0);
      stats.ctimeMs = 0;
      stats.nlink = 0;

      return [filePath.replace(dirPath + path.sep, ''), stats];
    }),
  );
}

async function datInferrer(options: Options, romFiles: File[]): Promise<DAT> {
  // Run DATGameInferrer, but condense all DATs down to one
  const datGames = (
    await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles)
  ).flatMap((dat) => dat.getGames());
  // TODO(cemmer): filter to unique games / remove duplicates
  return new LogiqxDAT({ header: new Header({ name: 'ROMWriter Test' }), games: datGames });
}

async function candidateWriter(
  optionsProps: OptionsProps,
  inputTemp: string,
  inputGlob: string,
  patchGlob: string | undefined,
  outputTemp: string,
): Promise<[string, Stats][]> {
  // Given
  const options = new Options({
    ...optionsProps,
    input: [path.join(inputTemp, 'roms', inputGlob)],
    inputExclude: [path.join(inputTemp, 'roms', '**', '*.nkit.*')],
    ...(patchGlob ? { patch: [path.join(inputTemp, patchGlob)] } : {}),
    output: outputTemp,
  });

  let romFiles: File[] = [];
  try {
    romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
  } catch {
    /* ignored */
  }

  const dat = await datInferrer(options, romFiles);
  const romFilesWithHeaders = await new ROMHeaderProcessor(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
  ).process(romFiles);
  const indexedRomFiles = new ROMIndexer(options, new ProgressBarFake()).index(romFilesWithHeaders);
  let candidates = await new CandidateGenerator(options, new ProgressBarFake()).generate(
    dat,
    indexedRomFiles,
  );
  if (patchGlob) {
    const patches = await new PatchScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
    ).scan();
    candidates = await new CandidatePatchGenerator(new ProgressBarFake()).generate(
      dat,
      candidates,
      patches,
    );
  }
  candidates = await new CandidateExtensionCorrector(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
  ).correct(dat, candidates);
  candidates = new CandidateCombiner(options, new ProgressBarFake()).combine(dat, candidates);

  // When
  await new CandidateWriter(options, new ProgressBarFake()).write(dat, candidates);

  // Then
  return walkAndStat(outputTemp);
}

it('should not do anything if there are no candidates', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Given
    const options = new Options({ commands: ['copy'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

    // When
    await candidateWriter(options, os.devNull, '**/*', undefined, outputTemp);

    // Then no files were written
    await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

    // And the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

it('should not do anything with no write commands', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Given
    const options = new Options({ commands: ['report'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

    // When
    await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

    // Then no files were written
    await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

    // And the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

it('should not do anything if the input and output files are the same', async () => {
  await copyFixturesToTemp(async (inputTemp) => {
    // Given
    const options = new Options({ commands: ['report'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(inputTemp)).resolves.not.toHaveLength(0);

    // When
    await candidateWriter(options, inputTemp, '**/*', undefined, inputTemp);

    // Then the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

describe('zip', () => {
  it('should not write if the output is the input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const inputZip = path.join(inputTemp, 'roms', 'zip');
      const inputFilesBefore = await walkAndStat(inputZip);
      expect(inputFilesBefore.length).toBeGreaterThan(0);

      // When
      await candidateWriter(options, inputTemp, 'zip/*', undefined, inputZip);

      // Then the input files weren't touched
      await expect(walkAndStat(inputZip)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is expected and overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwrite: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output is expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Note: need to exclude some ROMs to prevent duplicate output paths
      const inputGlob = '**/!(chd|headerless)/*';

      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        inputGlob,
        undefined,
        outputTemp,
      );

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is not expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // And the files are made invalid
      await Promise.all(
        outputFilesBefore.map(async ([filePath]) => {
          const resolvedPath = path.join(outputTemp, filePath);
          await FsPoly.rm(resolvedPath);
          await FsPoly.touch(resolvedPath);
        }),
      );

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not move if tested zip has wrong number of entries', () => {
    // TODO(cemmer)
  });

  it('should not move if tested zip is missing an entry', () => {
    // TODO(cemmer)
  });

  it('should not move if tested zip has an entry with an unexpected checksum', () => {
    // TODO(cemmer)
  });

  test.each([
    // Control group of headerless files
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '9180a163'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'f6cc9b1c'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '1e58456d'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx', '2d251538'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.smc', '9adca6cc'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])(
    'should not remove headers if not requested: %s',
    async (inputGlob, expectedFileName, expectedCrc) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        const options = new Options({ commands: ['copy', 'zip', 'test'] });
        const outputFiles = await candidateWriter(
          options,
          inputTemp,
          inputGlob,
          undefined,
          outputTemp,
        );
        expect(outputFiles).toHaveLength(1);
        const archiveEntries = await new FileFactory(new FileCache(), LOGGER).filesFrom(
          path.join(outputTemp, outputFiles[0][0]),
        );
        expect(archiveEntries).toHaveLength(1);
        const archiveEntry = archiveEntries[0] as ArchiveEntry<Archive>;
        expect(archiveEntry.getEntryPath()).toEqual(expectedFileName);
        expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
      });
    },
  );

  test.each([
    // Control group of headerless files
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '6339abe6'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'a1eaa7c1'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '3ecbac61'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lyx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'zip', 'test'],
        removeHeaders: [''], // all
      });
      const outputFiles = await candidateWriter(
        options,
        inputTemp,
        inputGlob,
        undefined,
        outputTemp,
      );
      expect(outputFiles).toHaveLength(1);
      const archiveEntries = await new FileFactory(new FileCache(), LOGGER).filesFrom(
        path.join(outputTemp, outputFiles[0][0]),
      );
      expect(archiveEntries).toHaveLength(1);
      const archiveEntry = archiveEntries[0] as ArchiveEntry<Archive>;
      expect(archiveEntry.getEntryPath()).toEqual(expectedFileName);
      expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group of files without patches
    ['raw/empty.rom', [['empty.zip|empty.rom', '00000000']]],
    ['raw/fizzbuzz.nes', [['fizzbuzz.zip|fizzbuzz.nes', '370517b5']]],
    ['raw/foobar.lnx', [['foobar.zip|foobar.lnx', 'b22c9747']]],
    ['raw/loremipsum.rom', [['loremipsum.zip|loremipsum.rom', '70856527']]],
    // Patchable files
    [
      'patchable/before.rom',
      [
        ['After.zip|After.rom', '4c8e44d4'],
        ['before.zip|before.rom', '0361b321'],
      ],
    ],
    [
      'patchable/best.gz',
      [
        ['best.zip|best.rom', '1e3d78cf'],
        ['Worst.zip|Worst.rom', '6ff9ef96'],
      ],
    ],
  ])('should patch files if appropriate: %s', async (inputGlob, expectedFilesAndCrcs) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'zip', 'test'],
      });
      const outputFiles = await candidateWriter(
        options,
        inputTemp,
        inputGlob,
        'patches',
        outputTemp,
      );

      const writtenRomsAndCrcs = (
        await Promise.all(
          outputFiles.map(async ([outputPath]) =>
            new FileFactory(new FileCache(), LOGGER).filesFrom(path.join(outputTemp, outputPath)),
          ),
        )
      )
        .flat()
        .map((entry) => [
          entry.toString().replace(outputTemp + path.sep, ''),
          entry.getCrc32() ?? '',
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(writtenRomsAndCrcs).toEqual(expectedFilesAndCrcs);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.zip',
        '2048.zip',
        '3708F2C.zip',
        '4096.zip',
        '612644F.zip',
        '65D1206.zip',
        '92C85C9.zip',
        'C01173E.zip',
        'CD-ROM.zip',
        'GD-ROM.zip',
        'GameCube-240pSuite-1.19.zip',
        'KDULVQN.zip',
        'UMD.zip',
        'before.zip',
        'best.zip',
        'empty.zip',
        'five.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ],
    ],
    [
      '7z/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
    ],
    [
      'raw/*',
      [
        'empty.zip',
        'five.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.zip',
        'loremipsum.zip',
        'one.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
    ],
  ])('should copy, zip, and test: %s', async (inputGlob, expectedOutputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // When
      const outputFiles = (
        await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
      )
        .map((pair) => pair[0])
        .sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.zip',
        '2048.zip',
        '3708F2C.zip',
        '4096.zip',
        '612644F.zip',
        '65D1206.zip',
        '92C85C9.zip',
        'C01173E.zip',
        'CD-ROM.zip',
        'GD-ROM.zip',
        'GameCube-240pSuite-1.19.zip',
        'KDULVQN.zip',
        'UMD.zip',
        'before.zip',
        'best.zip',
        'empty.zip',
        'five.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ],
      [
        // no input files are TorrentZip
      ],
    ],
    [
      '7z/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
      [],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
      [],
    ],
    [
      'raw/*',
      [
        'empty.zip',
        'five.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.zip',
        'loremipsum.zip',
        'one.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ],
      [],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
      [],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
      [
        // no input files are TorrentZip
      ],
    ],
  ])(
    'should move, zip, and test: %s',
    async (inputGlob, expectedOutputPaths, expectedDeletedInputPaths) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        // Given
        const options = new Options({
          commands: ['move', 'zip', 'test'],
          zipFormat: ZipFormatInverted[ZipFormat.RVZSTD].toLowerCase(),
        });
        const romFilesBefore = await walkAndStat(path.join(inputTemp, 'roms'));
        await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

        // When
        const outputFiles = (
          await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
        )
          .map((pair) => pair[0])
          .sort();

        // Then the expected files were written
        expect(outputFiles).toEqual(expectedOutputPaths);

        // And the expected files were moved (deleted)
        const romFilesAfter = new Map(await walkAndStat(path.join(inputTemp, 'roms')));
        romFilesBefore
          .map(([inputFile, statsBefore]) => [statsBefore, romFilesAfter.get(inputFile)])
          .filter((statsTuple): statsTuple is [Stats, Stats] =>
            statsTuple.every((val) => val !== undefined),
          )
          .forEach(([statsBefore, statsAfter]) => {
            // File wasn't deleted, ensure it wasn't touched
            expect(statsAfter).toEqual(statsBefore);
          });
        expect(
          romFilesBefore
            .filter(([inputFile]) => !romFilesAfter.has(inputFile))
            .map(([inputFile]) => inputFile)
            .sort(),
        ).toEqual(expectedDeletedInputPaths.sort());
      });
    },
  );

  test.each([
    [
      '**/!(chd)/*',
      [
        ['ROMWriter Test.zip|0F09A40.rom', '2f943e86'],
        ['ROMWriter Test.zip|3708F2C.rom', '20891c9f'],
        ['ROMWriter Test.zip|612644F.rom', 'f7591b29'],
        ['ROMWriter Test.zip|65D1206.rom', '20323455'],
        ['ROMWriter Test.zip|92C85C9.rom', '06692159'],
        ['ROMWriter Test.zip|allpads.nes', '9180a163'],
        ['ROMWriter Test.zip|before.rom', '0361b321'],
        ['ROMWriter Test.zip|best.rom', '1e3d78cf'],
        ['ROMWriter Test.zip|C01173E.rom', 'dfaebe28'],
        [`ROMWriter Test.zip|${path.join('CD-ROM', 'CD-ROM (Track 1).bin')}`, '49ca35fb'],
        [`ROMWriter Test.zip|${path.join('CD-ROM', 'CD-ROM (Track 2).bin')}`, '0316f720'],
        [`ROMWriter Test.zip|${path.join('CD-ROM', 'CD-ROM (Track 3).bin')}`, 'a320af40'],
        [`ROMWriter Test.zip|${path.join('CD-ROM', 'CD-ROM.cue')}`, '4ce39e73'],
        ['ROMWriter Test.zip|color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
        ['ROMWriter Test.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
        ['ROMWriter Test.zip|empty.rom', '00000000'],
        ['ROMWriter Test.zip|fds_joypad_test.fds', '1e58456d'],
        ['ROMWriter Test.zip|five.rom', '3e5daf67'],
        ['ROMWriter Test.zip|fizzbuzz.nes', '370517b5'],
        ['ROMWriter Test.zip|foobar.lnx', 'b22c9747'],
        ['ROMWriter Test.zip|four.rom', '1cf3ca74'],
        [`ROMWriter Test.zip|${path.join('fourfive', 'five.rom')}`, '3e5daf67'],
        [`ROMWriter Test.zip|${path.join('fourfive', 'four.rom')}`, '1cf3ca74'],
        [`ROMWriter Test.zip|GameCube-240pSuite-1.19.iso`, '5eb3d183'],
        [`ROMWriter Test.zip|${path.join('GD-ROM', 'GD-ROM.gdi')}`, 'f16f621c'],
        [`ROMWriter Test.zip|${path.join('GD-ROM', 'track01.bin')}`, '9796ed9a'],
        [`ROMWriter Test.zip|${path.join('GD-ROM', 'track02.raw')}`, 'abc178d5'],
        [`ROMWriter Test.zip|${path.join('GD-ROM', 'track03.bin')}`, '61a363f1'],
        [`ROMWriter Test.zip|${path.join('GD-ROM', 'track04.bin')}`, 'fc5ff5a0'],
        [`ROMWriter Test.zip|${path.join('invalid', 'invalid.7z')}`, 'df941cc9'],
        [`ROMWriter Test.zip|${path.join('invalid', 'invalid.rar')}`, 'df941cc9'],
        [`ROMWriter Test.zip|${path.join('invalid', 'invalid.tar.gz')}`, 'df941cc9'],
        [`ROMWriter Test.zip|${path.join('invalid', 'invalid.zip')}`, 'df941cc9'],
        ['ROMWriter Test.zip|KDULVQN.rom', 'b1c303e4'],
        ['ROMWriter Test.zip|LCDTestROM.lnx', '2d251538'],
        ['ROMWriter Test.zip|loremipsum.rom', '70856527'],
        ['ROMWriter Test.zip|one.rom', 'f817a89f'],
        [`ROMWriter Test.zip|${path.join('onetwothree', '1', 'one.rom')}`, 'f817a89f'],
        [`ROMWriter Test.zip|${path.join('onetwothree', '2', 'two.rom')}`, '96170874'],
        [`ROMWriter Test.zip|${path.join('onetwothree', '3', 'three.rom')}`, 'ff46c5d8'],
        ['ROMWriter Test.zip|speed_test_v51.sfc', '8beffd94'],
        ['ROMWriter Test.zip|speed_test_v51.smc', '9adca6cc'],
        ['ROMWriter Test.zip|three.rom', 'ff46c5d8'],
        ['ROMWriter Test.zip|two.rom', '96170874'],
        ['ROMWriter Test.zip|UMD.iso', 'e90f7cf5'],
        ['ROMWriter Test.zip|unknown.rom', '377a7727'],
      ],
    ],
    [
      'raw/*',
      [
        ['ROMWriter Test.zip|empty.rom', '00000000'],
        ['ROMWriter Test.zip|five.rom', '3e5daf67'],
        ['ROMWriter Test.zip|fizzbuzz.nes', '370517b5'],
        ['ROMWriter Test.zip|foobar.lnx', 'b22c9747'],
        ['ROMWriter Test.zip|four.rom', '1cf3ca74'],
        ['ROMWriter Test.zip|loremipsum.rom', '70856527'],
        ['ROMWriter Test.zip|one.rom', 'f817a89f'],
        ['ROMWriter Test.zip|three.rom', 'ff46c5d8'],
        ['ROMWriter Test.zip|two.rom', '96170874'],
        ['ROMWriter Test.zip|unknown.rom', '377a7727'],
      ],
    ],
  ])(
    'should write one zip with all ROMs for zip-dat-name: %s',
    async (inputGlob, expectedFilesAndCrcs) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        // Given
        const options = new Options({ commands: ['copy', 'zip'], zipDatName: true });
        await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

        // When
        const outputFiles = await candidateWriter(
          options,
          inputTemp,
          inputGlob,
          undefined,
          outputTemp,
        );

        // Then
        expect(outputFiles).toHaveLength(1);
        const outputFile = path.join(outputTemp, outputFiles[0][0]);
        const writtenRomsAndCrcs = (
          await new FileFactory(new FileCache(), LOGGER).filesFrom(outputFile)
        )
          .map((entry) => [
            entry.toString().replace(outputTemp + path.sep, ''),
            entry.getCrc32() ?? '',
          ])
          .sort((a, b) => a[0].localeCompare(b[0]));
        expect(writtenRomsAndCrcs).toEqual(expectedFilesAndCrcs);
      });
    },
  );
});

describe('extract', () => {
  it('should not write if the output is the input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'extract', 'test'] });
      const inputRaw = path.join(inputTemp, 'roms', 'raw');
      const inputFilesBefore = await walkAndStat(inputRaw);
      expect(inputFilesBefore.length).toBeGreaterThan(0);

      // When
      await candidateWriter(options, inputTemp, 'raw/*', undefined, inputRaw);

      // Then the input files weren't touched
      await expect(walkAndStat(inputRaw)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'extract'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is expected and overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'extract'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwrite: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output is expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Note: need to exclude some ROMs to prevent duplicate output paths
      const inputGlob = '**/!(chd)/*';

      // Given
      const options = new Options({ commands: ['copy', 'extract'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        inputGlob,
        undefined,
        outputTemp,
      );

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is not expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'extract'], writerThreads: 1 });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // And the files are made invalid
      await Promise.all(
        outputFilesBefore.map(async ([filePath]) => {
          const resolvedPath = path.join(outputTemp, filePath);
          await FsPoly.rm(resolvedPath);
          await FsPoly.touch(resolvedPath);
        }),
      );

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    // Control group of headerless files
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '9180a163'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'f6cc9b1c'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '1e58456d'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx', '2d251538'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.smc', '9adca6cc'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])(
    'should not remove headers if not requested: %s',
    async (inputGlob, expectedFileName, expectedCrc) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        const options = new Options({ commands: ['copy', 'extract', 'test'] });
        const outputFiles = await candidateWriter(
          options,
          inputTemp,
          inputGlob,
          undefined,
          outputTemp,
        );
        expect(outputFiles).toHaveLength(1);
        expect(outputFiles[0][0]).toEqual(expectedFileName);
        const outputFile = await File.fileOf(
          { filePath: path.join(outputTemp, outputFiles[0][0]) },
          ChecksumBitmask.CRC32,
        );
        expect(outputFile.getCrc32()).toEqual(expectedCrc);
      });
    },
  );

  test.each([
    // Control group of headerless files
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '6339abe6'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'a1eaa7c1'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '3ecbac61'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lyx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'extract', 'test'],
        removeHeaders: [''], // all
      });
      const outputFiles = await candidateWriter(
        options,
        inputTemp,
        inputGlob,
        undefined,
        outputTemp,
      );
      expect(outputFiles).toHaveLength(1);
      expect(outputFiles[0][0]).toEqual(expectedFileName);
      const outputFile = await File.fileOf(
        { filePath: path.join(outputTemp, outputFiles[0][0]) },
        ChecksumBitmask.CRC32,
      );
      expect(outputFile.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group of files without patches
    ['raw/empty.rom', [['empty.rom', '00000000']]],
    ['raw/fizzbuzz.nes', [['fizzbuzz.nes', '370517b5']]],
    ['raw/foobar.lnx', [['foobar.lnx', 'b22c9747']]],
    ['raw/loremipsum.rom', [['loremipsum.rom', '70856527']]],
    // Patchable files
    [
      'patchable/before.rom',
      [
        ['After.rom', '4c8e44d4'],
        ['before.rom', '0361b321'],
      ],
    ],
    [
      'patchable/best.gz',
      [
        ['best.rom', '1e3d78cf'],
        ['Worst.rom', '6ff9ef96'],
      ],
    ],
  ])('should patch files if appropriate: %s', async (inputGlob, expectedFilesAndCrcs) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'extract', 'test'],
      });
      const outputFiles = await candidateWriter(
        options,
        inputTemp,
        inputGlob,
        'patches',
        outputTemp,
      );

      const writtenRomsAndCrcs = (
        await Promise.all(
          outputFiles.map(async ([outputPath]) =>
            new FileFactory(new FileCache(), LOGGER).filesFrom(path.join(outputTemp, outputPath)),
          ),
        )
      )
        .flat()
        .map((entry) => [
          entry.toString().replace(outputTemp + path.sep, ''),
          entry.getCrc32() ?? '',
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(writtenRomsAndCrcs).toEqual(expectedFilesAndCrcs);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.rom',
        '2048',
        '3708F2C.rom',
        '4096',
        '612644F.rom',
        '65D1206.rom',
        '92C85C9.rom',
        'C01173E.rom',
        path.join('CD-ROM', 'CD-ROM (Track 1).bin'),
        path.join('CD-ROM', 'CD-ROM (Track 2).bin'),
        path.join('CD-ROM', 'CD-ROM (Track 3).bin'),
        path.join('CD-ROM', 'CD-ROM.cue'),
        path.join('GD-ROM', 'GD-ROM.gdi'),
        path.join('GD-ROM', 'track01.bin'),
        path.join('GD-ROM', 'track02.raw'),
        path.join('GD-ROM', 'track03.bin'),
        path.join('GD-ROM', 'track04.bin'),
        'GameCube-240pSuite-1.19.iso',
        'KDULVQN.rom',
        'UMD.iso',
        'before.rom',
        'best.rom',
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        path.join('fourfive', 'five.rom'),
        path.join('fourfive', 'four.rom'),
        'invalid.7z',
        'invalid.rar',
        'invalid.tar.gz',
        'invalid.zip',
        'loremipsum.rom',
        'one.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
    ],
    [
      '7z/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.7z',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.rar',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
    ],
    [
      'raw/*',
      [
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.tar.gz',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        path.join('fourfive', 'five.rom'),
        path.join('fourfive', 'four.rom'),
        'invalid.zip',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
    ],
  ])('should copy, extract, and test: %s', async (inputGlob, expectedOutputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({
        commands: ['copy', 'extract', 'test'],
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // When
      const outputFiles = (
        await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
      )
        .map((pair) => pair[0])
        .sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.rom',
        '2048',
        '3708F2C.rom',
        '4096',
        '612644F.rom',
        '65D1206.rom',
        '92C85C9.rom',
        'C01173E.rom',
        path.join('CD-ROM', 'CD-ROM (Track 1).bin'),
        path.join('CD-ROM', 'CD-ROM (Track 2).bin'),
        path.join('CD-ROM', 'CD-ROM (Track 3).bin'),
        path.join('CD-ROM', 'CD-ROM.cue'),
        path.join('GD-ROM', 'GD-ROM.gdi'),
        path.join('GD-ROM', 'track01.bin'),
        path.join('GD-ROM', 'track02.raw'),
        path.join('GD-ROM', 'track03.bin'),
        path.join('GD-ROM', 'track04.bin'),
        'GameCube-240pSuite-1.19.iso',
        'KDULVQN.rom',
        'UMD.iso',
        'before.rom',
        'best.rom',
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        path.join('fourfive', 'five.rom'),
        path.join('fourfive', 'four.rom'),
        'invalid.7z',
        'invalid.rar',
        'invalid.tar.gz',
        'invalid.zip',
        'loremipsum.rom',
        'one.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
      [
        path.join('7z', 'invalid.7z'),
        path.join('discs', 'CD-ROM (Track 1).bin'),
        path.join('discs', 'CD-ROM (Track 2).bin'),
        path.join('discs', 'CD-ROM (Track 3).bin'),
        path.join('discs', 'CD-ROM.cue'),
        path.join('discs', 'GD-ROM.gdi'),
        path.join('discs', 'UMD.iso'),
        path.join('discs', 'track01.bin'),
        path.join('discs', 'track02.raw'),
        path.join('discs', 'track03.bin'),
        path.join('discs', 'track04.bin'),
        path.join('patchable', '0F09A40.rom'),
        path.join('patchable', '3708F2C.rom'),
        path.join('patchable', '612644F.rom'),
        path.join('patchable', '65D1206.rom'),
        path.join('patchable', '92C85C9.rom'),
        path.join('patchable', 'C01173E.rom'),
        path.join('patchable', 'KDULVQN.rom'),
        path.join('patchable', 'before.rom'),
        path.join('raw', 'empty.rom'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'fizzbuzz.nes'),
        path.join('raw', 'foobar.lnx'),
        path.join('raw', 'four.rom'),
        path.join('raw', 'loremipsum.rom'),
        path.join('raw', 'one.rom'),
        path.join('raw', 'three.rom'),
        path.join('raw', 'two.rom'),
        path.join('raw', 'unknown.rom'),
      ],
    ],
    [
      '7z/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.7z',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
      [path.join('7z', 'invalid.7z')],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.rar',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
      [path.join('rar', 'invalid.rar')],
    ],
    [
      'raw/*',
      [
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
      [
        path.join('raw', 'empty.rom'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'fizzbuzz.nes'),
        path.join('raw', 'foobar.lnx'),
        path.join('raw', 'four.rom'),
        path.join('raw', 'loremipsum.rom'),
        path.join('raw', 'one.rom'),
        path.join('raw', 'three.rom'),
        path.join('raw', 'two.rom'),
        path.join('raw', 'unknown.rom'),
      ],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        'invalid.tar.gz',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
      [path.join('tar', 'invalid.tar.gz')],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.nes',
        'foobar.lnx',
        path.join('fourfive', 'five.rom'),
        path.join('fourfive', 'four.rom'),
        'invalid.zip',
        'loremipsum.rom',
        path.join('onetwothree', '1', 'one.rom'),
        path.join('onetwothree', '2', 'two.rom'),
        path.join('onetwothree', '3', 'three.rom'),
        'unknown.rom',
      ],
      [path.join('zip', 'invalid.zip')],
    ],
  ])(
    'should move, extract, and test: %s',
    async (inputGlob, expectedOutputPaths, expectedDeletedInputPaths) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        // Given
        const options = new Options({
          commands: ['move', 'extract', 'test'],
          dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        });
        const romFilesBefore = await walkAndStat(path.join(inputTemp, 'roms'));
        await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

        // When
        const outputFiles = (
          await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
        )
          .map((pair) => pair[0])
          .sort();

        // Then the expected files were written
        expect(outputFiles).toEqual(expectedOutputPaths);

        // And the expected files were moved (deleted)
        const romFilesAfter = new Map(await walkAndStat(path.join(inputTemp, 'roms')));
        romFilesBefore
          .map(([inputFile, statsBefore]) => [statsBefore, romFilesAfter.get(inputFile)])
          .filter((statsTuple): statsTuple is [Stats, Stats] =>
            statsTuple.every((val) => val !== undefined),
          )
          .forEach(([statsBefore, statsAfter]) => {
            // File wasn't deleted, ensure it wasn't touched
            expect(statsAfter).toEqual(statsBefore);
          });
        expect(
          romFilesBefore
            .filter(([inputFile]) => !romFilesAfter.has(inputFile))
            .map(([inputFile]) => inputFile)
            .sort(),
        ).toIncludeSameMembers(expectedDeletedInputPaths.sort());
      });
    },
  );
});

describe('raw', () => {
  it('should not write if the output is the input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'test'] });
      const inputRaw = path.join(inputTemp, 'roms', 'raw');
      const inputFilesBefore = await walkAndStat(inputRaw);
      expect(inputFilesBefore.length).toBeGreaterThan(0);

      // When
      await candidateWriter(options, inputTemp, 'raw/*', undefined, inputRaw);

      // Then the input files weren't touched
      await expect(walkAndStat(inputRaw)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is expected and overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwrite: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should not write anything if the output is expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output is not expected and overwriting invalid', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      expect(outputFilesBefore.some(([, stats]) => stats.isSymbolicLink())).toEqual(false);

      // And the files are made invalid
      await Promise.all(
        outputFilesBefore.map(async ([filePath]) => {
          const resolvedPath = path.join(outputTemp, filePath);
          await FsPoly.rm(resolvedPath);
          await FsPoly.touch(resolvedPath);
        }),
      );

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    // Control group of headered files that can be removed
    ['headered/allpads.nes', 'allpads.nes', '9180a163'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.smc', '9adca6cc'],
    // Archives not being extracted
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78.7z', '1b55e0ff'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds.zip', '0b94518e'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx.rar', '32629801'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc.gz', '7fc0e473'],
  ])(
    'should not remove headers if not requested: %s',
    async (inputGlob, expectedFileName, expectedCrc) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        const options = new Options({ commands: ['copy', 'test'] });
        const outputFiles = await candidateWriter(
          options,
          inputTemp,
          inputGlob,
          undefined,
          outputTemp,
        );
        expect(outputFiles).toHaveLength(1);
        expect(outputFiles[0][0]).toEqual(expectedFileName);
        const outputFile = await File.fileOf(
          { filePath: path.join(outputTemp, outputFiles[0][0]) },
          ChecksumBitmask.CRC32,
        );
        expect(outputFile.getCrc32()).toEqual(expectedCrc);
      });
    },
  );

  test.each([
    // Control group of headered files that can be removed
    ['headered/allpads.nes', 'allpads.nes', '6339abe6'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
    // Archives not being extracted
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78.7z', '1b55e0ff'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds.zip', '0b94518e'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx.rar', '32629801'],
    ['headerless/speed_test_v51.sfc.gz', 'speed_test_v51.sfc.gz', '7fc0e473'],
  ])(
    'should not remove headers even if requested: %s',
    async (inputGlob, expectedFileName, expectedCrc) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        const options = new Options({
          commands: ['copy', 'test'],
          removeHeaders: [''], // all
        });
        const outputFiles = await candidateWriter(
          options,
          inputTemp,
          inputGlob,
          undefined,
          outputTemp,
        );
        expect(outputFiles).toHaveLength(1);
        expect(outputFiles[0][0]).toEqual(expectedFileName);
        const outputFile = await File.fileOf(
          { filePath: path.join(outputTemp, outputFiles[0][0]) },
          ChecksumBitmask.CRC32,
        );
        expect(outputFile.getCrc32()).toEqual(expectedCrc);
      });
    },
  );

  test.each([
    // Control group of files without patches
    ['raw/empty.rom', [['empty.rom', '00000000']]],
    ['raw/fizzbuzz.nes', [['fizzbuzz.nes', '370517b5']]],
    ['raw/foobar.lnx', [['foobar.lnx', 'b22c9747']]],
    ['raw/loremipsum.rom', [['loremipsum.rom', '70856527']]],
    // Patchable files
    [
      'patchable/before.rom',
      [
        ['After.rom', '4c8e44d4'],
        ['before.rom', '0361b321'],
      ],
    ],
    // Note: best.gz|best.rom can't be patched because we're raw copying
  ])('should patch files if appropriate: %s', async (inputGlob, expectedFilesAndCrcs) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'test'],
      });
      const outputFiles = await candidateWriter(
        options,
        inputTemp,
        inputGlob,
        'patches',
        outputTemp,
      );

      const writtenRomsAndCrcs = (
        await Promise.all(
          outputFiles.map(async ([outputPath]) =>
            new FileFactory(new FileCache(), LOGGER).filesFrom(path.join(outputTemp, outputPath)),
          ),
        )
      )
        .flat()
        .map((entry) => [
          entry.toString().replace(outputTemp + path.sep, ''),
          entry.getCrc32() ?? '',
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(writtenRomsAndCrcs).toEqual(expectedFilesAndCrcs);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.rom',
        '2048.chd',
        '3708F2C.rom',
        '4096.chd',
        '612644F.rom',
        '65D1206.rom',
        '92C85C9.rom',
        'C01173E.rom',
        'CD-ROM.chd',
        'GD-ROM.chd',
        'GameCube-240pSuite-1.19.gcz',
        'KDULVQN.rom',
        'UMD.cso',
        'before.rom',
        'best.gz',
        'empty.rom',
        'five.rom',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.rom',
        'fourfive.zip',
        'invalid.7z',
        'invalid.rar',
        'invalid.tar.gz',
        'invalid.zip',
        'loremipsum.zip',
        'one.gz',
        'onetwothree.zip',
        'three.gz',
        'two.gz',
        'unknown.zip',
      ],
    ],
    [
      '7z/*',
      ['fizzbuzz.7z', 'foobar.7z', 'invalid.7z', 'loremipsum.7z', 'onetwothree.7z', 'unknown.7z'],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.rar',
        'foobar.rar',
        'invalid.rar',
        'loremipsum.rar',
        'onetwothree.rar',
        'unknown.rar',
      ],
    ],
    [
      'raw/*',
      [
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.tar.gz',
        'foobar.tar.gz',
        'invalid.tar.gz',
        'loremipsum.tar.gz',
        'onetwothree.tar.gz',
        'unknown.tar.gz',
      ],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
    ],
  ])('should copy raw and test: %s', async (inputGlob, expectedOutputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // When
      const outputFiles = (
        await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
      )
        .map((pair) => pair[0])
        .sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(header*)/*',
      [
        '0F09A40.rom',
        '2048.chd',
        '3708F2C.rom',
        '4096.chd',
        '612644F.rom',
        '65D1206.rom',
        '92C85C9.rom',
        'C01173E.rom',
        'CD-ROM.chd',
        'GD-ROM.chd',
        'GameCube-240pSuite-1.19.gcz',
        'KDULVQN.rom',
        'UMD.cso',
        'before.rom',
        'best.gz',
        'empty.rom',
        'five.rom',
        'fizzbuzz.zip',
        'foobar.zip',
        'four.rom',
        'fourfive.zip',
        'invalid.7z',
        'invalid.rar',
        'invalid.tar.gz',
        'invalid.zip',
        'loremipsum.zip',
        'one.gz',
        'onetwothree.zip',
        'three.gz',
        'two.gz',
        'unknown.zip',
      ],
      [
        path.join('7z', 'invalid.7z'),
        path.join('chd', '2048.chd'),
        path.join('chd', '4096.chd'),
        path.join('chd', 'CD-ROM.chd'),
        path.join('chd', 'GD-ROM.chd'),
        path.join('cso', 'UMD.cso'),
        path.join('gcz', 'GameCube-240pSuite-1.19.gcz'),
        path.join('gz', 'one.gz'),
        path.join('gz', 'three.gz'),
        path.join('gz', 'two.gz'),
        path.join('patchable', '0F09A40.rom'),
        path.join('patchable', '3708F2C.rom'),
        path.join('patchable', '612644F.rom'),
        path.join('patchable', '65D1206.rom'),
        path.join('patchable', '92C85C9.rom'),
        path.join('patchable', 'C01173E.rom'),
        path.join('patchable', 'KDULVQN.rom'),
        path.join('patchable', 'before.rom'),
        path.join('patchable', 'best.gz'),
        path.join('raw', 'empty.rom'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'four.rom'),
        path.join('zip', 'fizzbuzz.zip'),
        path.join('zip', 'foobar.zip'),
        path.join('zip', 'fourfive.zip'),
        path.join('zip', 'loremipsum.zip'),
        path.join('zip', 'onetwothree.zip'),
        path.join('zip', 'unknown.zip'),
      ],
    ],
    [
      '7z/*',
      ['fizzbuzz.7z', 'foobar.7z', 'invalid.7z', 'loremipsum.7z', 'onetwothree.7z', 'unknown.7z'],
      [
        path.join('7z', 'fizzbuzz.7z'),
        path.join('7z', 'foobar.7z'),
        path.join('7z', 'invalid.7z'),
        path.join('7z', 'loremipsum.7z'),
        path.join('7z', 'onetwothree.7z'),
        path.join('7z', 'unknown.7z'),
      ],
    ],
    [
      'rar/*',
      [
        'fizzbuzz.rar',
        'foobar.rar',
        'invalid.rar',
        'loremipsum.rar',
        'onetwothree.rar',
        'unknown.rar',
      ],
      [
        path.join('rar', 'fizzbuzz.rar'),
        path.join('rar', 'foobar.rar'),
        path.join('rar', 'invalid.rar'),
        path.join('rar', 'loremipsum.rar'),
        path.join('rar', 'onetwothree.rar'),
        path.join('rar', 'unknown.rar'),
      ],
    ],
    [
      'raw/*',
      [
        'empty.rom',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ],
      [
        path.join('raw', 'empty.rom'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'fizzbuzz.nes'),
        path.join('raw', 'foobar.lnx'),
        path.join('raw', 'four.rom'),
        path.join('raw', 'loremipsum.rom'),
        path.join('raw', 'one.rom'),
        path.join('raw', 'three.rom'),
        path.join('raw', 'two.rom'),
        path.join('raw', 'unknown.rom'),
      ],
    ],
    [
      'tar/*',
      [
        'fizzbuzz.tar.gz',
        'foobar.tar.gz',
        'invalid.tar.gz',
        'loremipsum.tar.gz',
        'onetwothree.tar.gz',
        'unknown.tar.gz',
      ],
      [
        path.join('tar', 'fizzbuzz.tar.gz'),
        path.join('tar', 'foobar.tar.gz'),
        path.join('tar', 'invalid.tar.gz'),
        path.join('tar', 'loremipsum.tar.gz'),
        path.join('tar', 'onetwothree.tar.gz'),
        path.join('tar', 'unknown.tar.gz'),
      ],
    ],
    [
      'zip/*',
      [
        'fizzbuzz.zip',
        'foobar.zip',
        'fourfive.zip',
        'invalid.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ],
      [
        path.join('zip', 'fizzbuzz.zip'),
        path.join('zip', 'foobar.zip'),
        path.join('zip', 'fourfive.zip'),
        path.join('zip', 'invalid.zip'),
        path.join('zip', 'loremipsum.zip'),
        path.join('zip', 'onetwothree.zip'),
        path.join('zip', 'unknown.zip'),
      ],
    ],
  ])(
    'should move raw and test: %s',
    async (inputGlob, expectedOutputPaths, expectedDeletedInputPaths) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        // Given
        const options = new Options({ commands: ['move', 'test'] });
        const romFilesBefore = await walkAndStat(path.join(inputTemp, 'roms'));
        await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

        // When
        const outputFiles = (
          await candidateWriter(options, inputTemp, inputGlob, undefined, outputTemp)
        )
          .map((pair) => pair[0])
          .sort();

        // Then the expected files were written
        expect(outputFiles).toEqual(expectedOutputPaths);

        // And the expected files were moved (deleted)
        const romFilesAfter = new Map(await walkAndStat(path.join(inputTemp, 'roms')));
        romFilesBefore
          .map(([inputFile, statsBefore]) => [statsBefore, romFilesAfter.get(inputFile)])
          .filter((statsTuple): statsTuple is [Stats, Stats] =>
            statsTuple.every((val) => val !== undefined),
          )
          .forEach(([statsBefore, statsAfter]) => {
            // File wasn't deleted, ensure it wasn't touched
            expect(statsAfter).toEqual(statsBefore);
          });
        expect(
          romFilesBefore
            .filter(([inputFile]) => !romFilesAfter.has(inputFile))
            .map(([inputFile]) => inputFile)
            .sort(),
        ).toEqual(expectedDeletedInputPaths.sort());
      });
    },
  );
});

describe('link', () => {
  test.each([[true], [false]])('should not write if the output is the input', async (symlink) => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Given
      const options = new Options({ commands: ['link', 'test'], symlink });
      const inputRaw = path.join(inputTemp, 'roms', 'raw');
      const inputFilesBefore = await walkAndStat(inputRaw);
      expect(inputFilesBefore.length).toBeGreaterThan(0);

      // When
      await candidateWriter(options, inputTemp, 'raw/*', undefined, inputRaw);

      // Then the input files weren't touched
      await expect(walkAndStat(inputRaw)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([[true], [false]])(
    'should not write anything if the output exists and not overwriting',
    async (symlink) => {
      await copyFixturesToTemp(async (inputTemp, outputTemp) => {
        // Given
        const options = new Options({ commands: ['link', 'test'], symlink });
        const inputFilesBefore = await walkAndStat(inputTemp);
        await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

        // And we've written once
        await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

        // And files were written
        const outputFilesBefore = await walkAndStat(outputTemp);
        expect(outputFilesBefore).not.toHaveLength(0);
        for (const [, stats] of outputFilesBefore) {
          expect(stats.isSymbolicLink()).toEqual(symlink);
        }

        // When we write again
        await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

        // Then the output wasn't touched
        await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

        // And the input files weren't touched
        await expect(walkAndStat(inputTemp)).resolves.toMatchObject(inputFilesBefore);
      });
    },
  );

  it('should write if the output is expected and overwriting symlinks', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['link', 'test'], symlink: true });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      for (const [, stats] of outputFilesBefore) {
        expect(stats.isSymbolicLink()).toEqual(true);
      }

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwrite: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched because the symlinks were recreated
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);
      for (const [, stats] of outputFilesAfter) {
        expect(stats.isSymbolicLink()).toEqual(true);
      }

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toMatchObject(inputFilesBefore);
    });
  });

  it('should write if the output is expected and overwriting hard links', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['link', 'test'], symlink: false });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      for (const [, stats] of outputFilesBefore) {
        expect(stats.isSymbolicLink()).toEqual(false);
      }

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwrite: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output is the same as before because the same hard links were recreated
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).toEqual(outputFilesBefore);
      for (const [, stats] of outputFilesAfter) {
        expect(stats.isSymbolicLink()).toEqual(false);
      }

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toMatchObject(inputFilesBefore);
    });
  });

  it('should write if the output is not expected and overwriting invalid symlinks', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['link', 'test'], symlink: true });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      for (const [, stats] of outputFilesBefore) {
        expect(stats.isSymbolicLink()).toEqual(true);
      }

      // And the files are made invalid
      await Promise.all(
        outputFilesBefore.map(async ([filePath]) => {
          const resolvedPath = path.join(outputTemp, filePath);
          await FsPoly.rm(resolvedPath);
          await FsPoly.touch(resolvedPath);
        }),
      );

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output was touched because the symlinks were recreated
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);
      for (const [, stats] of outputFilesAfter) {
        expect(stats.isSymbolicLink()).toEqual(true);
      }

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toMatchObject(inputFilesBefore);
    });
  });

  it('should write if the output is not expected and overwriting invalid hard links', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['link', 'test'], symlink: false });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // And we've written once
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      for (const [, stats] of outputFilesBefore) {
        expect(stats.isSymbolicLink()).toEqual(false);
      }

      // And the files are made invalid
      await Promise.all(
        outputFilesBefore.map(async ([filePath]) => {
          const resolvedPath = path.join(outputTemp, filePath);
          await FsPoly.rm(resolvedPath);
          await FsPoly.touch(resolvedPath);
        }),
      );

      // When we write again
      await candidateWriter(
        {
          ...options,
          overwriteInvalid: true,
        },
        inputTemp,
        '**/*',
        undefined,
        outputTemp,
      );

      // Then the output is the same as before because the same hard links were recreated
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0])).toEqual(
        outputFilesBefore.map((pair) => pair[0]),
      );
      expect(outputFilesAfter).toEqual(outputFilesBefore);
      for (const [, stats] of outputFilesAfter) {
        expect(stats.isSymbolicLink()).toEqual(false);
      }

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toMatchObject(inputFilesBefore);
    });
  });

  it('should write relative symlinks', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({
        commands: ['link', 'test'],
        symlink: true,
        symlinkRelative: true,
      });
      await expect(walkAndStat(outputTemp)).resolves.toHaveLength(0);

      // When we write
      await candidateWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // Then files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toHaveLength(0);
      for (const [outputPath, stats] of outputFilesBefore) {
        expect(stats.isSymbolicLink()).toEqual(true);
        const outputPathAbsolute = path.resolve(path.join(outputTemp, outputPath));
        const outputPathResolved = path.resolve(
          path.dirname(outputPathAbsolute),
          await FsPoly.readlink(outputPathAbsolute),
        );
        await expect(FsPoly.exists(outputPathResolved)).resolves.toEqual(true);
        expect(outputPathResolved.startsWith(inputTemp)).toEqual(true);
      }
    });
  });
});
