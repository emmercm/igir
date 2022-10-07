import { jest } from '@jest/globals';
import { promises as fsPromises, Stats } from 'fs';
import os from 'os';
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
  await fsPromises.rm(outputTemp, { force: true, recursive: true });

  // Call the callback
  await callback(inputTemp, outputTemp);

  // Delete the temp files
  await fsPromises.rm(inputTemp, { recursive: true });
  await fsPromises.rm(outputTemp, { force: true, recursive: true });
}

async function walkAndStat(dirPath: string): Promise<[string, Stats][]> {
  if (!await fsPoly.exists(dirPath)) {
    return [];
  }
  return Promise.all(
    fsPoly.walkSync(dirPath).map(async (filePath) => {
      let stats: Stats;
      try {
        stats = {
          ...await fsPromises.stat(filePath),
          // Hard-code properties that can change with file reads
          atime: new Date(0),
          atimeMs: 0,
        };
      } catch (e) {
        stats = new Stats();
      }
      return [
        filePath.replace(path.normalize(dirPath) + path.sep, ''),
        stats,
      ];
    }),
  );
}

function datScanner(gameNameToFiles: Map<string, File[]>): DAT {
  const games = [...gameNameToFiles.entries()]
    .map(([gameName, files]) => {
      const roms = files
        // De-duplicate
        .filter((one, idx, romFiles) => romFiles
          .findIndex((two) => two.getExtractedFilePath() === one.getExtractedFilePath()) === idx)
        // Map
        .map((file) => new ROM(
          path.basename(file.getExtractedFilePath()),
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
  inputGlob: string,
): Promise<Map<string, File[]>> {
  return (await new ROMScanner(new Options({
    ...options,
    input: [path.join(inputDir, inputGlob)],
  }), new ProgressBarFake()).scan())
    // Reduce all the unique files for all games
    .filter((one, idx, files) => files
      .findIndex((two) => two.equals(one)) === idx)
    // Map
    .reduce((map, romFile) => {
      const romName = path.parse(romFile.getFilePath()).name;
      if (map.has(romName)) {
        map.set(romName, [...map.get(romName) as File[], romFile]);
      } else {
        map.set(romName, [romFile]);
      }
      return map;
    }, new Map<string, File[]>());
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
  inputGlob: string,
  outputTemp: string,
): Promise<[string, Stats][]> {
  // Given
  const options = new Options({
    ...optionsProps,
    input: [inputTemp],
    output: outputTemp,
  });
  const gameNameToFiles = await romScanner(options, inputTemp, inputGlob);
  const dat = datScanner(gameNameToFiles);
  const candidates = await candidateGenerator(options, dat, gameNameToFiles);

  // When
  await new ROMWriter(options, new ProgressBarFake()).write(dat, candidates);

  // Then
  return walkAndStat(outputTemp);
}

it('should not do anything if there are no parents', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Given
    const options = new Options({ commands: ['copy'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

    // When
    await romWriter(options, os.devNull, '**/*', outputTemp);

    // Then no files were written
    await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

    // And the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

it('should not do anything with no write commands', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Given
    const options = new Options({ commands: ['report'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

    // When
    await romWriter(options, inputTemp, '**/*', outputTemp);

    // Then no files were written
    await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

    // And the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

describe('zip', () => {
  it('should not write anything if input matches output', () => {
    // TODO(cemmer)
  });

  it('should not write anything if the output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // And we've written once
      await romWriter(options, inputTemp, '**/*', outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter(options, inputTemp, '**/*', outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output exists and are overwriting', () => {
    // TODO(cemmer)
  });

  test.each([
    [
      '**/!(headered)/*',
      ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'onetwothree.zip', 'three.zip', 'two.zip', 'unknown.zip'],
    ],
    [
      '7z/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
    ],
    [
      'rar/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
    ],
    [
      'raw/*',
      ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'three.zip', 'two.zip', 'unknown.zip'],
    ],
    [
      'zip/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
    ],
  ])('should copy, zip, and test: %s', async (inputGlob, expectedOutputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(headered)/*',
      ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'onetwothree.zip', 'three.zip', 'two.zip', 'unknown.zip'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      '7z/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
      ['7z/fizzbuzz.7z', '7z/foobar.7z', '7z/loremipsum.7z', '7z/onetwothree.7z', '7z/unknown.7z'],
    ],
    [
      'rar/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
      ['rar/fizzbuzz.rar', 'rar/foobar.rar', 'rar/loremipsum.rar', 'rar/onetwothree.rar', 'rar/unknown.rar'],
    ],
    [
      'raw/*',
      ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'three.zip', 'two.zip', 'unknown.zip'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      'zip/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
      ['zip/fizzbuzz.zip', 'zip/foobar.zip', 'zip/loremipsum.zip', 'zip/onetwothree.zip', 'zip/unknown.zip'],
    ],
  ])('should move, zip, and test: %s', async (inputGlob, expectedOutputPaths, expectedDeletedInputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['move', 'zip', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp))
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

  it('should not write anything if the output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // And we've written once
      await romWriter(options, inputTemp, '**/*', outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter(options, inputTemp, '**/*', outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if the output exists and are overwriting', () => {
    // TODO(cemmer)
  });

  test.each([
    [
      '**/!(headered)/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      '7z/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      'rar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      'raw/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      'zip/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
  ])('should copy and test: %s', async (inputGlob, expectedOutputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(headered)/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      '7z/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['7z/fizzbuzz.7z', '7z/foobar.7z', '7z/loremipsum.7z', '7z/onetwothree.7z', '7z/unknown.7z'],
    ],
    [
      'rar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['rar/fizzbuzz.rar', 'rar/foobar.rar', 'rar/loremipsum.rar', 'rar/onetwothree.rar', 'rar/unknown.rar'],
    ],
    [
      'raw/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      'zip/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['zip/fizzbuzz.zip', 'zip/foobar.zip', 'zip/loremipsum.zip', 'zip/onetwothree.zip', 'zip/unknown.zip'],
    ],
  ])('should move and test: %s', async (inputGlob, expectedOutputPaths, expectedDeletedInputPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['move', 'test'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp))
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
