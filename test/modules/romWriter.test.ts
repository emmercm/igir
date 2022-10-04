import { jest } from '@jest/globals';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import ROMScanner from '../../src/modules/romScanner.js';
import ROMWriter from '../../src/modules/romWriter.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
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

async function generateReleaseCandidates(
  optionsProps: OptionsProps,
  inputDir: string,
  inputGlob: string,
): Promise<Map<Parent, ReleaseCandidate[]>> {
  // Leverage the ROMScanner
  const scannedRomFiles = await new ROMScanner(new Options({
    input: [path.join(inputDir, inputGlob)],
  }), new ProgressBarFake()).scan();

  // Generate a DAT with games for every scanned file
  const dat = new DAT(new Header(), scannedRomFiles.map((romFile) => new Game({
    name: path.parse(romFile.getFilePath()).name,
    rom: [new ROM(
      path.basename(romFile.getFilePath()),
      romFile.getSize(),
      romFile.getCrc32(),
    )],
  })));

  return new CandidateGenerator(new Options(optionsProps), new ProgressBarFake())
    .generate(dat, scannedRomFiles);
}

async function runRomWriter(
  optionProps: OptionsProps,
  outputTemp: string,
  parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
): Promise<string[]> {
  const options = new Options({
    output: outputTemp,
    ...optionProps,
  });
  const dat = new DAT(new Header(), []);

  await new ROMWriter(options, new ProgressBarFake())
    .write(dat, parentsToCandidates);

  try {
    return fsPoly.walkSync(outputTemp)
      .map((filePath) => filePath.replace(outputTemp + path.sep, ''))
      .sort() as string[];
  } catch (e) {
    return [];
  }
}

it('shouldn\'t write anything if no parents', async () => {
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

  const writtenPaths = await runRomWriter({
    commands: ['copy'],
  }, os.devNull, parentsToCandidates);
  expect(writtenPaths).toEqual([]);
});

it('shouldn\'t write anything if parents have no candidates', async () => {
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();
  parentsToCandidates.set(new Parent('none', []), []);

  const writtenPaths = await runRomWriter({
    commands: ['copy'],
  }, os.devNull, parentsToCandidates);
  expect(writtenPaths).toEqual([]);
});

it('shouldn\'t write anything if not copying or moving', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Make sure we started with some input ROMs
    const inputFiles = fsPoly.walkSync(inputTemp);
    expect(inputFiles.length).toBeGreaterThan(0);

    const optionsProps = {
      commands: [],
    };
    const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, 'zip/*');

    const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
    expect(writtenPaths).toEqual([]);

    // Make sure we didn't alter the input ROMs
    expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
  });
});

describe('zip', () => {
  it('shouldn\'t write anything if output matches input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'zip', 'test'],
      };
      const zipDir = path.join(inputTemp, 'zip');
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, zipDir, '*');

      const writtenPaths = await runRomWriter(optionsProps, zipDir, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'onetwothree.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('shouldn\'t write anything if output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'zip'],
      };
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, '**/!(headered)/*');

      // Write once
      expect(() => fsPoly.walkSync(outputTemp)).toThrow(/no such file/i);
      const firstWrittenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter({
        commands: ['copy', 'zip'],
      }, outputTemp, parentsToCandidates);
      expect(secondWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should write if output exists and are overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'zip'],
      };
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, '**/!(headered)/*');

      // Write once
      expect(() => fsPoly.walkSync(outputTemp)).toThrow(/no such file/i);
      const firstWrittenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ]);

      // Write again, overwriting
      const secondWrittenPaths = await runRomWriter({
        ...optionsProps,
        overwrite: true,
      }, outputTemp, parentsToCandidates);
      expect(secondWrittenPaths).toEqual(firstWrittenPaths);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should clean before writing if output exists, has contents, and are overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'zip'],
        overwrite: true,
      };
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, '**/!(headered)/*');

      await fsPromises.mkdir(outputTemp);
      await fsPromises.copyFile(path.join(inputTemp, 'zip', 'loremipsum.zip'), path.join(outputTemp, 'fizzbuzz.zip'));
      await fsPromises.copyFile(path.join(inputTemp, 'zip', 'loremipsum.zip'), path.join(outputTemp, 'foobar.zip'));

      expect(fsPoly.walkSync(outputTemp)).toHaveLength(2);
      const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'one.zip',
        'onetwothree.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  test.each([
    ['**/!(headered)/*', ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'onetwothree.zip', 'three.zip', 'two.zip', 'unknown.zip']],
    ['7z/*', ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip']],
    ['rar/*', ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip']],
    ['raw/*', ['empty.zip', 'fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'one.zip', 'three.zip', 'two.zip', 'unknown.zip']],
    ['zip/*', ['fizzbuzz.zip', 'foobar.zip', 'loremipsum.zip', 'onetwothree.zip', 'unknown.zip']],
  ])('should copy, zip, and test: %s', async (inputGlob, expectedWrittenPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'zip', 'test'],
      };
      const parentsToCandidates = await generateReleaseCandidates(
        optionsProps,
        inputTemp,
        inputGlob,
      );

      const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(writtenPaths).toEqual(expectedWrittenPaths);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should move, zip, and test everything', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['move', 'zip', 'test'],
      };
      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, rawDir, '*');

      const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'one.zip',
        'three.zip',
        'two.zip',
        'unknown.zip',
      ]);

      expect(fsPoly.walkSync(rawDir)).toEqual([]);
    });
  });
});

describe('raw', () => {
  it('shouldn\'t write anything if output matches input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy'],
      };
      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, rawDir, '*');

      const writtenPaths = await runRomWriter(optionsProps, rawDir, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('shouldn\'t write anything if output exists and not overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy'],
      };
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, '**/!(headered)/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(secondWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should write if output exists and are overwriting', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy'],
      };
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, inputTemp, '**/!(headered)/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ]);

      // Write again, overwriting
      const secondWrittenPaths = await runRomWriter({
        commands: ['copy'],
        overwrite: true,
      }, outputTemp, parentsToCandidates);
      expect(secondWrittenPaths).toEqual(firstWrittenPaths);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  test.each([
    ['**/!(headered)/*', ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom']],
    ['7z/*', ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom']],
    ['rar/*', ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom']],
    ['raw/*', ['empty.rom', 'fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom']],
    ['zip/*', ['fizzbuzz.nes', 'foobar.lnx', 'loremipsum.rom', 'one.rom', 'three.rom', 'two.rom', 'unknown.rom']],
  ])('should copy and test: %s', async (inputGlob, expectedWrittenPaths) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['copy', 'test'],
      };
      const parentsToCandidates = await generateReleaseCandidates(
        optionsProps,
        inputTemp,
        inputGlob,
      );

      const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(writtenPaths).toEqual(expectedWrittenPaths);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should move and test everything', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const optionsProps = {
        commands: ['move', 'test'],
      };
      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await generateReleaseCandidates(optionsProps, rawDir, '*');

      const writtenPaths = await runRomWriter(optionsProps, outputTemp, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'loremipsum.rom',
        'one.rom',
        'three.rom',
        'two.rom',
        'unknown.rom',
      ]);

      expect(fsPoly.walkSync(rawDir)).toEqual([]);
    });
  });
});
