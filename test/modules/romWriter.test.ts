import { promises as fsPromises, Stats } from 'fs';
import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DATInferrer from '../../src/modules/datInferrer.js';
import HeaderProcessor from '../../src/modules/headerProcessor.js';
import PatchCandidateGenerator from '../../src/modules/patchCandidateGenerator.js';
import PatchScanner from '../../src/modules/patchScanner.js';
import ROMScanner from '../../src/modules/romScanner.js';
import ROMWriter from '../../src/modules/romWriter.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Archive from '../../src/types/archives/archive.js';
import FileFactory from '../../src/types/archives/fileFactory.js';
import ArchiveEntry from '../../src/types/files/archiveEntry.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import Patch from '../../src/types/patches/patch.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
): Promise<void> {
  // Set up the input directory
  const inputTemp = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'input'));
  fsPoly.copyDirSync('./test/fixtures', inputTemp);

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'output'));
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

async function datInferrer(romFiles: File[]): Promise<DAT> {
  // Run DATInferrer, but condense all DATs down to one
  const datGames = (await new DATInferrer(new ProgressBarFake()).infer(romFiles))
    .map((dat) => dat.getGames())
    .flatMap((games) => games);
  return new DAT(new Header(), datGames);
}

async function romScanner(options: Options): Promise<File[]> {
  return (await new ROMScanner(new Options({
    ...options,
    dat: [''], // force ROMScanner to unique files
  }), new ProgressBarFake()).scan())
    // Reduce all the unique files for all games
    .filter((one, idx, files) => files
      .findIndex((two) => two.hashCodes().join() === one.hashCodes().join()) === idx);
}

async function headerProcessor(
  options: Options,
  romFiles: File[],
): Promise<File[]> {
  return new HeaderProcessor(options, new ProgressBarFake()).process(romFiles);
}

async function candidateGenerator(
  options: Options,
  dat: DAT,
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  return new CandidateGenerator(options, new ProgressBarFake()).generate(dat, romFiles);
}

async function patchScanner(
  options: Options,
): Promise<Patch[]> {
  return new PatchScanner(options, new ProgressBarFake()).scan();
}

async function patchCandidateGenerator(
  dat: DAT,
  parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  patches: Patch[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  return new PatchCandidateGenerator(new ProgressBarFake())
    .generate(dat, parentsToCandidates, patches);
}

async function romWriter(
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
    ...(patchGlob ? { patch: [path.join(inputTemp, patchGlob)] } : {}),
    output: outputTemp,
  });
  const romFiles = await romScanner(options);
  const dat = await datInferrer(romFiles);
  const gameNamesToHeaderedFiles = await headerProcessor(options, romFiles);
  let candidates = await candidateGenerator(options, dat, gameNamesToHeaderedFiles);
  if (patchGlob) {
    const patches = await patchScanner(options);
    candidates = await patchCandidateGenerator(dat, candidates, patches);
  }

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
    await romWriter(options, os.devNull, '**/*', undefined, outputTemp);

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
    await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

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
    await romWriter(options, inputTemp, '**/*', undefined, inputTemp);

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
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

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
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTemp, '**/*', undefined, outputTemp);

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
      }, inputTemp, 'zip/*', undefined, outputTemp);

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
    ['unheadered/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should not remove headers if not requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({ commands: ['copy', 'zip', 'test'] });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp));
      expect(outputFiles).toHaveLength(1);
      const archiveEntries = await FileFactory.filesFrom(path.join(outputTemp, outputFiles[0][0]));
      expect(archiveEntries).toHaveLength(1);
      const archiveEntry = archiveEntries[0] as ArchiveEntry<Archive>;
      expect(archiveEntry.getEntryPath()).toEqual(expectedFileName);
      expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
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
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lyx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
    ['unheadered/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'zip', 'test'],
        removeHeaders: ['.nes', '.a78', '.fds', '.lnx', '.smc'],
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp));
      expect(outputFiles).toHaveLength(1);
      const archiveEntries = await FileFactory.filesFrom(path.join(outputTemp, outputFiles[0][0]));
      expect(archiveEntries).toHaveLength(1);
      const archiveEntry = archiveEntries[0] as ArchiveEntry<Archive>;
      expect(archiveEntry.getEntryPath()).toEqual(expectedFileName);
      expect(archiveEntry.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group
    ['raw/empty.rom', [['empty.zip|empty.rom', '00000000']]],
    ['raw/fizzbuzz.nes', [['fizzbuzz.zip|fizzbuzz.nes', '370517b5']]],
    ['raw/foobar.lnx', [['foobar.zip|foobar.lnx', 'b22c9747']]],
    ['raw/loremipsum.rom', [['loremipsum.zip|loremipsum.rom', '70856527']]],
    // Patchable files
    ['patchable/before.rom', [
      ['After.zip|After.rom', '4c8e44d4'],
      ['before.zip|before.rom', '0361b321'],
    ]],
    ['patchable/best.gz', [
      ['best.zip|best.rom', '1e3d78cf'],
      ['Worst.zip|Worst.rom', '6ff9ef96'],
    ]],
  ])('should patch files if appropriate: %s', async (inputGlob, expectedFilesAndCrcs) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'zip', 'test'],
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, 'patches', outputTemp));

      const writtenRomAndCrcs = (await Promise.all(outputFiles
        .map(async ([outputPath]) => FileFactory.filesFrom(path.join(outputTemp, outputPath)))))
        .flatMap((entries) => entries)
        .map((entry) => [entry.toString().replace(outputTemp + path.sep, ''), entry.getCrc32()])
        .sort((a, b) => a[0].localeCompare(b[0]));
      // console.log(await walkAndStat(Constants.GLOBAL_TEMP_DIR));
      expect(writtenRomAndCrcs).toEqual(expectedFilesAndCrcs);
    });
  });

  test.each([
    [
      '**/!(*headered)/*',
      ['0F09A40.zip', '65D1206.zip', 'C01173E.zip', 'KDULVQN.zip', 'before.zip', 'best.zip', 'empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'three.zip', 'two.zip', 'unknown.zip'],
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
      'tar/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
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
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(*headered)/*',
      ['0F09A40.zip', '65D1206.zip', 'C01173E.zip', 'KDULVQN.zip', 'before.zip', 'best.zip', 'empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'three.zip', 'two.zip', 'unknown.zip'],
      ['patchable/0F09A40.rom', 'patchable/65D1206.rom', 'patchable/C01173E.rom', 'patchable/KDULVQN.rom', 'patchable/before.rom', 'patchable/best.gz', 'raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
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
      'tar/*',
      ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip'],
      ['tar/fizzbuzz.tar.gz', 'tar/foobar.tar.gz', 'tar/loremipsum.tar.gz', 'tar/onetwothree.tar.gz', 'tar/unknown.tar.gz'],
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
      const romFilesBefore = await walkAndStat(path.join(inputTemp, 'roms'));
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the expected files were moved (deleted)
      const romFilesAfter = await walkAndStat(path.join(inputTemp, 'roms'));
      romFilesBefore.forEach(([inputFile, statsBefore]) => {
        const [, statsAfter] = romFilesAfter
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
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

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
      await romWriter(options, inputTemp, '**/*', undefined, outputTemp);

      // And no files were written
      const outputFilesBefore = await walkAndStat(outputTemp);
      expect(outputFilesBefore).not.toEqual([]);

      // When we write again
      await romWriter({
        ...options,
        overwrite: true,
      }, inputTemp, '**/*', undefined, outputTemp);

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
      }, inputTemp, 'raw/*', undefined, outputTemp);

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
    ['unheadered/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should not remove headers if not requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({ commands: ['copy', 'test'] });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp));
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
    ['headered/LCDTestROM.lnx.rar', 'LCDTestROM.lyx', '42583855'],
    ['headered/speed_test_v51.smc', 'speed_test_v51.sfc', '8beffd94'],
    ['unheadered/speed_test_v51.sfc.gz', 'speed_test_v51.sfc', '8beffd94'],
  ])('should remove headers if requested: %s', async (inputGlob, expectedFileName, expectedCrc) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'test'],
        removeHeaders: ['.nes', '.a78', '.fds', '.lnx', '.smc'],
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp));
      expect(outputFiles).toHaveLength(1);
      expect(outputFiles[0][0]).toEqual(expectedFileName);
      const outputFile = await File.fileOf(path.join(outputTemp, outputFiles[0][0]));
      expect(outputFile.getCrc32()).toEqual(expectedCrc);
    });
  });

  test.each([
    // Control group
    ['raw/empty.rom', [['empty.rom', '00000000']]],
    ['raw/fizzbuzz.nes', [['fizzbuzz.nes', '370517b5']]],
    ['raw/foobar.lnx', [['foobar.lnx', 'b22c9747']]],
    ['raw/loremipsum.rom', [['loremipsum.rom', '70856527']]],
    // Patchable files
    ['patchable/before.rom', [
      ['After.rom', '4c8e44d4'],
      ['before.rom', '0361b321'],
    ]],
    ['patchable/best.gz', [
      ['best.rom', '1e3d78cf'],
      ['Worst.rom', '6ff9ef96'],
    ]],
  ])('should patch files if appropriate: %s', async (inputGlob, expectedFilesAndCrcs) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const options = new Options({
        commands: ['copy', 'test'],
      });
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, 'patches', outputTemp));

      const writtenRomAndCrcs = (await Promise.all(outputFiles
        .map(async ([outputPath]) => FileFactory.filesFrom(path.join(outputTemp, outputPath)))))
        .flatMap((entries) => entries)
        .map((entry) => [entry.toString().replace(outputTemp + path.sep, ''), entry.getCrc32()])
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(writtenRomAndCrcs).toEqual(expectedFilesAndCrcs);
    });
  });

  test.each([
    [
      '**/!(*headered)/*',
      ['0F09A40.rom', '65D1206.rom', 'C01173E.rom', 'KDULVQN.rom', 'before.rom', 'best.rom', 'empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
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
      'tar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
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
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the input files weren't touched
      await expect(walkAndStat(inputTemp)).resolves.toEqual(inputFilesBefore);
    });
  });

  test.each([
    [
      '**/!(*headered)/*',
      ['0F09A40.rom', '65D1206.rom', 'C01173E.rom', 'KDULVQN.rom', 'before.rom', 'best.rom', 'empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom'],
      ['patchable/0F09A40.rom', 'patchable/65D1206.rom', 'patchable/C01173E.rom', 'patchable/KDULVQN.rom', 'patchable/before.rom', 'patchable/best.gz', 'raw/empty.rom', 'raw/fizzbuzz.nes', 'raw/foobar.lnx', 'raw/loremipsum.rom', 'raw/one.rom', 'raw/three.rom', 'raw/two.rom', 'raw/unknown.rom'],
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
      'tar/*',
      ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', path.join('onetwothree', 'one.rom'), path.join('onetwothree', 'three.rom'), path.join('onetwothree', 'two.rom'), 'unknown.rom'],
      ['tar/fizzbuzz.tar.gz', 'tar/foobar.tar.gz', 'tar/loremipsum.tar.gz', 'tar/onetwothree.tar.gz', 'tar/unknown.tar.gz'],
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
      const romFilesBefore = await walkAndStat(path.join(inputTemp, 'roms'));
      await expect(walkAndStat(outputTemp)).resolves.toEqual([]);

      // When
      const outputFiles = (await romWriter(options, inputTemp, inputGlob, undefined, outputTemp))
        .map((pair) => pair[0]).sort();

      // Then the expected files were written
      expect(outputFiles).toEqual(expectedOutputPaths);

      // And the expected files were moved (deleted)
      const romFilesAfter = await walkAndStat(path.join(inputTemp, 'roms'));
      romFilesBefore.forEach(([inputFile, statsBefore]) => {
        const [, statsAfter] = romFilesAfter
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
