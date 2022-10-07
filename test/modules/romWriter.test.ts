import { jest } from '@jest/globals';
import { promises as fsPromises, Stats } from 'fs';
import path from 'path';

import Constants from '../../src/constants.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import ROMScanner from '../../src/modules/romScanner.js';
import ROMWriter from '../../src/modules/romWriter.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

jest.setTimeout(10_000);

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
  copyFixtures = true,
): Promise<void> {
  // Set up the input directory
  const inputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  if (copyFixtures) {
    fsPoly.copyDirSync('./test/fixtures/roms', inputTemp);
  }

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });

  // Call the callback
  await callback(inputTemp, outputTemp);

  // Delete the temp files
  fsPoly.rmSync(inputTemp, { recursive: true });
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });
}

async function walkAndStat(dirPath: string): Promise<[string, Stats][]> {
  if (!await fsPoly.exists(dirPath)) {
    return [];
  }
  return Promise.all(
    fsPoly.walkSync(dirPath).map(async (filePath) => [
      filePath.replace(path.normalize(dirPath) + path.sep, ''),
      {
        ...await fsPromises.stat(filePath),
        // Hard-code properties that can change with file reads
        atime: new Date(0),
        atimeMs: 0,
      },
    ]),
  );
}

function datScanner(gameNameToFiles: Map<string, File[]>): DAT {
  const games = [...gameNameToFiles.entries()]
    .map(([gameName, files]) => {
      const roms = files.map((file) => new ROM(
        file.getExtractedFilePath(),
        file.getSize(),
        file.getCrc32(),
      ));
      return new Game({
        name: gameName,
        rom: roms,
      });
    });
  return new DAT(new Header(), games);
}

async function romScanner(
  options: Options,
  inputDir: string,
  gameNameToFilesPaths: Map<string, string[]>,
): Promise<Map<string, File[]>> {
  return new Map<string, File[]>(await Promise.all(
    [...gameNameToFilesPaths.entries()]
      .map(async ([gameName, filePaths]) => {
        const fullFilePaths = filePaths.map((filePath) => path.join(inputDir, filePath));
        const scannedFiles = await new ROMScanner(new Options({
          ...options,
          input: fullFilePaths,
        }), new ProgressBarFake()).scan();

        // Reduce all the unique files for all games
        const filteredFiles = scannedFiles
          .filter((one, idx, files) => files
            .findIndex((two) => two.getExtractedFilePath() === one.getExtractedFilePath()) === idx);
        return [gameName, filteredFiles];
      }) as Promise<[string, File[]]>[],
  ));
}

async function candidateGenerator(
  options: Options,
  dat: DAT,
  gameNameToFiles: Map<string, File[]>,
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const romFiles = [...gameNameToFiles.values()].flatMap((files) => files);
  return new CandidateGenerator(options, new ProgressBarFake()).generate(dat, romFiles);
}

async function romWriter(
  optionsProps: OptionsProps,
  inputTemp: string,
  outputTemp: string,
  gameNamesToFilePaths: [string, string[]][],
): Promise<[string, Stats][]> {
  // Given
  const options = new Options({
    ...optionsProps,
    input: [inputTemp],
    output: outputTemp,
  });
  const gameNameToFiles = await romScanner(options, inputTemp, new Map(gameNamesToFilePaths));
  const dat = datScanner(gameNameToFiles);
  const candidates = await candidateGenerator(options, dat, gameNameToFiles);

  // When
  await new ROMWriter(options, new ProgressBarFake()).write(dat, candidates);

  // Then
  return walkAndStat(outputTemp);
}

it('should not do anything if there are no parents', () => {
  // TODO(cemmer)
});

it('should not do anything with no write commands', () => {
  // TODO(cemmer)
});

describe('zip', () => {
  it('should not write anything if input matches output', () => {
    // TODO(cemmer)
  });

  it('should not write anything if the output exists and not overwriting', () => {
    // TODO(cemmer)
  });

  it('should write if the output exists and are overwriting', () => {
    // TODO(cemmer)
  });

  test.each([
    [
      'one game with one file',
      [['Game One', ['*/fizzbuzz.7z']]],
      ['Game One.zip'],
    ],
    [
      'one game with multiple files',
      [['Game One', ['*/fizzbuzz.rar', '*/foobar.7z']]],
      ['Game One.zip'],
    ],
    [
      'multiple games with varying files',
      [
        ['Game One', ['*/fizzbuzz.zip']],
        ['Game Two', ['*/foobar.rar', '*/loremipsum.7z']],
      ],
      ['Game One.zip', 'Game Two.zip'],
    ],
  ] as [string, [string, string[]][], string[]][])('should copy, zip, and test: %s', async (
    testName,
    gameNamesToFilePaths,
    expectedOutputPaths,
  ) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, outputTemp, gameNamesToFilePaths))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      const inputFilesAfter = await walkAndStat(inputTemp);
      expect(inputFilesAfter).toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      'one game with one file',
      [['Game One', ['*/fizzbuzz.7z']]],
      ['Game One.zip'],
      ['7z/fizzbuzz.7z'],
    ],
    [
      'one game with multiple files',
      [['Game One', ['*/fizzbuzz.rar', '*/foobar.7z']]],
      ['Game One.zip'],
      ['rar/fizzbuzz.rar', '7z/foobar.7z'],
    ],
    [
      'multiple games with varying files',
      [
        ['Game One', ['*/fizzbuzz.zip']],
        ['Game Two', ['*/foobar.rar', '*/loremipsum.7z']],
      ],
      ['Game One.zip', 'Game Two.zip'],
      ['zip/fizzbuzz.zip', 'rar/foobar.rar', '7z/loremipsum.7z'],
    ],
  ] as [string, [string, string[]][], string[], string[]][])('should move, zip, and test: %s', async (
    testName,
    gameNamesToFilePaths,
    expectedOutputPaths,
    expectedDeletedInputPaths,
  ) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['move', 'zip', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, outputTemp, gameNamesToFilePaths))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the expected files were moved (deleted)
      const inputFilesAfter = await walkAndStat(inputTemp);
      inputFilesBefore.forEach(([inputFile, statsBefore]) => {
        const [, statsAfter] = inputFilesAfter
          .filter(([inputFileAfter]) => inputFileAfter === inputFile)[0] || [];
        if (statsAfter) {
          // File wasn't deleted, ensure it wasn't touched
          expect(statsAfter).toEqual(statsBefore);
        } else {
          // File was deleted, ensure it was expected
          expect(expectedDeletedInputPaths).toContain(inputFile.replace(/[\\/]/g, '/'));
        }
      });
    });
  });
});

describe('raw', () => {
  it('should not write anything if input matches output', () => {
    // TODO(cemmer)
  });

  it('should not write anything if the output exists and not overwriting', () => {
    // TODO(cemmer)
  });

  it('should write if the output exists and are overwriting', () => {
    // TODO(cemmer)
  });

  test.each([
    [
      'one game with one file',
      [['Game One', ['*/fizzbuzz.7z']]],
      ['fizzbuzz.nes'],
    ],
    [
      'one game with multiple files',
      [['Game One', ['*/fizzbuzz.rar', '*/foobar.7z']]],
      ['fizzbuzz.nes', 'foobar.lnx'],
    ],
    [
      'multiple games with varying files',
      [
        ['Game One', ['*/fizzbuzz.zip']],
        ['Game Two', ['*/foobar.rar', '*/loremipsum.7z']],
      ],
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom'],
    ],
  ] as [string, [string, string[]][], string[]][])('should copy and test: %s', async (
    testName,
    gameNamesToFilePaths,
    expectedOutputPaths,
  ) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, outputTemp, gameNamesToFilePaths))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      const inputFilesAfter = await walkAndStat(inputTemp);
      expect(inputFilesAfter).toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      'one game with one file',
      [['Game One', ['*/fizzbuzz.7z']]],
      ['fizzbuzz.nes'],
      ['7z/fizzbuzz.7z'],
    ],
    [
      'one game with multiple files',
      [['Game One', ['*/fizzbuzz.rar', '*/foobar.7z']]],
      ['fizzbuzz.nes', 'foobar.lnx'],
      ['rar/fizzbuzz.rar', '7z/foobar.7z'],
    ],
    [
      'multiple games with varying files',
      [
        ['Game One', ['*/fizzbuzz.zip']],
        ['Game Two', ['*/foobar.rar', '*/loremipsum.7z']],
      ],
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom'],
      ['zip/fizzbuzz.zip', 'rar/foobar.rar', '7z/loremipsum.7z'],
    ],
  ] as [string, [string, string[]][], string[], string[]][])('should move and test: %s', async (
    testName,
    gameNamesToFilePaths,
    expectedOutputPaths,
    expectedDeletedInputPaths,
  ) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['move', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, outputTemp, gameNamesToFilePaths))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the expected files were moved (deleted)
      const inputFilesAfter = await walkAndStat(inputTemp);
      inputFilesBefore.forEach(([inputFile, statsBefore]) => {
        const [, statsAfter] = inputFilesAfter
          .filter(([inputFileAfter]) => inputFileAfter === inputFile)[0] || [];
        if (statsAfter) {
          // File wasn't deleted, ensure it wasn't touched
          expect(statsAfter).toEqual(statsBefore);
        } else {
          // File was deleted, ensure it was expected
          expect(expectedDeletedInputPaths).toContain(inputFile.replace(/[\\/]/g, '/'));
        }
      });
    });
  });
});
