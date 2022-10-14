import { jest } from '@jest/globals';
import { promises as fsPromises, Stats } from 'fs';
import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import HeaderProcessor from '../../src/modules/headerProcessor.js';
import ROMScanner from '../../src/modules/romScanner.js';
import ROMWriter from '../../src/modules/romWriter.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import ArchiveFactory from '../../src/types/archives/archiveFactory.js';
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
): Promise<void> {
  // Set up the input directory
  const inputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync('./test/fixtures/roms', inputTemp);

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  await fsPoly.rm(outputTemp, { force: true, recursive: true });

  // Call the callback
  await callback(inputTemp, outputTemp);

  // Delete the temp files
  await fsPoly.rm(inputTemp, { recursive: true });
  await fsPoly.rm(outputTemp, { force: true, recursive: true });
}

async function walkAndStat(dirPath: string): Promise<[string, Stats][]> {
  if (!await fsPoly.exists(dirPath)) {
    return [];
  }
  return Promise.all(
    fsPoly.walkSync(dirPath)
      .sort()
      .map(async (filePath) => {
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

async function headerProcessor(
  options: Options,
  gameNameToFiles: Map<string, File[]>,
): Promise<Map<string, File[]>> {
  return new Map(await Promise.all([...gameNameToFiles.entries()]
    .map(async ([gameName, files]): Promise<[string, File[]]> => {
      const headeredFiles = await new HeaderProcessor(options, new ProgressBarFake())
        .process(files);
      return [gameName, headeredFiles];
    })));
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
  const gameNamesToHeaderedFiles = await headerProcessor(options, gameNameToFiles);
  const candidates = await candidateGenerator(options, dat, gameNamesToHeaderedFiles);

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

it('should not do anything if the input and output files are the same', async () => {
  await copyFixturesToTemp(async (inputTemp) => {
    // Given
    const options = new Options({ commands: ['report'] });
    const inputFilesBefore = await walkAndStat(inputTemp);
    await expect(walkAndStat(inputTemp)).resolves.not.toEqual([]);

    // When
    await romWriter(options, inputTemp, '**/*', inputTemp);

    // Then the input files weren't touched
    await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
  });
});

describe('zip', () => {
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

  it('should not write if the output is expected even if overwriting', async () => {
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
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTemp, '**/*', outputTemp);

      // Then the output wasn't touched
      await expect(walkAndStat(outputTemp)).resolves.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if overwriting and the output is unexpected', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy', 'zip'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // And the output has files
      const inputTempRaw = path.join(inputTemp, 'zip');
      await Promise.all(inputFilesBefore.map(async ([inputFile]) => {
        const outputFile = path.join(outputTemp, path.basename(inputFile));
        await fsPoly.touch(outputFile);
      }));
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTempRaw, '**/*', outputTemp);

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0]))
        .toEqual(outputFilesBefore.map((pair) => pair[0]));
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    // Control group
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
  ])('should not remove headers if not requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp));
      expect(outputFiles).toHaveLength(1);
      const archive = ArchiveFactory.archiveFrom(path.join(outputTemp, outputFiles[0][0]));
      const archiveEntries = await archive.getArchiveEntries();
      expect(archiveEntries).toHaveLength(1);
      expect(archiveEntries[0].getEntryPath()).toEqual(expectedFileName);
      expect(archiveEntries[0].getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '6339abe6'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'a1eaa7c1'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '3ecbac61'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'zip', 'test'],
        removeHeaders: true,
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp));
      expect(outputFiles).toHaveLength(1);
      const archive = ArchiveFactory.archiveFrom(path.join(outputTemp, outputFiles[0][0]));
      const archiveEntries = await archive.getArchiveEntries();
      expect(archiveEntries).toHaveLength(1);
      expect(archiveEntries[0].getEntryPath()).toEqual(expectedFileName);
      expect(archiveEntries[0].getCrc32()).toEqual(expectedCrc);
    });
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

  it('should not write if the output is expected even if overwriting', async () => {
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
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTemp, '**/*', outputTemp);

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0]))
        .toEqual(outputFilesBefore.map((pair) => pair[0]));
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  it('should write if overwriting and the output is unexpected', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given
      const options = new Options({ commands: ['copy'] });
      const inputFilesBefore = await walkAndStat(inputTemp);
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // And the output has files
      const inputTempRaw = path.join(inputTemp, 'raw');
      await Promise.all(inputFilesBefore.map(async ([inputFile]) => {
        const outputFile = path.join(outputTemp, path.basename(inputFile));
        await fsPoly.touch(outputFile);
      }));
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTempRaw, '**/*', outputTemp);

      // Then the output was touched
      const outputFilesAfter = await walkAndStat(outputTemp);
      expect(outputFilesAfter.map((pair) => pair[0]))
        .toEqual(outputFilesBefore.map((pair) => pair[0]));
      expect(outputFilesAfter).not.toEqual(outputFilesBefore);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    // Control group
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
  ])('should not remove headers if not requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({ commands: ['copy', 'test'] });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp));
      expect(outputFiles).toHaveLength(1);
      expect(outputFiles[0][0]).toEqual(expectedFileName);
      const outputFile = await File.fileOf(path.join(outputTemp, outputFiles[0][0]));
      expect(outputFile.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group
    ['raw/empty.rom', 'empty.rom', '00000000'],
    ['raw/fizzbuzz.nes', 'fizzbuzz.nes', '370517b5'],
    ['raw/foobar.lnx', 'foobar.lnx', 'b22c9747'],
    ['raw/loremipsum.rom', 'loremipsum.rom', '70856527'],
    // Headered files
    ['headered/allpads.nes', 'allpads.nes', '6339abe6'],
    ['headered/diagnostic_test_cartridge.a78.7z', 'diagnostic_test_cartridge.a78', 'a1eaa7c1'],
    ['headered/fds_joypad_test.fds.zip', 'fds_joypad_test.fds', '3ecbac61'],
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lnx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'test'],
        removeHeaders: true,
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, outputTemp));
      expect(outputFiles).toHaveLength(1);
      expect(outputFiles[0][0]).toEqual(expectedFileName);
      const outputFile = await File.fileOf(path.join(outputTemp, outputFiles[0][0]));
      expect(outputFile.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    [
      '**/!(headered)/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      '7z/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
    ],
    [
      'rar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
    ],
    [
      'raw/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
    ],
    [
      'zip/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
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
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'three.rom', 'two.rom', 'unknown.rom'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      '7z/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
      ['7z/fizzbuzz.7z', '7z/foobar.7z', '7z/loremipsum.7z', '7z/onetwothree.7z', '7z/unknown.7z'],
    ],
    [
      'rar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
      ['rar/fizzbuzz.rar', 'rar/foobar.rar', 'rar/loremipsum.rar', 'rar/onetwothree.rar', 'rar/unknown.rar'],
    ],
    [
      'raw/*',
      ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
    ],
    [
      'zip/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
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
