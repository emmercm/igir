import { jest } from '@jest/globals';
import AdmZip from 'adm-zip';
import os from 'os';
import path from 'path';

import ROMScanner from '../../src/modules/romScanner.js';
import ROMWriter from '../../src/modules/romWriter.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
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
  const inputTemp = fsPoly.mkdtempSync();
  if (copyFixtures) {
    fsPoly.copyDirSync('./test/fixtures/roms', inputTemp);
  }

  // Set up the output directory, but delete it so ROMWriter can make it
  const outputTemp = fsPoly.mkdtempSync();
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });

  // Call the callback
  await callback(inputTemp, outputTemp);

  // Delete the temp files
  fsPoly.rmSync(inputTemp, { recursive: true });
  fsPoly.rmSync(outputTemp, { force: true, recursive: true });
}

async function indexFilesByName(
  inputDir: string,
  inputGlob: string,
): Promise<Map<Parent, ReleaseCandidate[]>> {
  // Leverage the ROMScanner
  const scannedRomFiles = await new ROMScanner(new Options({
    input: [path.join(inputDir, inputGlob)],
  }), new ProgressBarFake()).scan();

  // Reduce the found File[]
  const romFilesByName = scannedRomFiles.reduce((map, romFile) => {
    const romName = path.parse(romFile.getFilePath()).name;
    if (map.has(romName)) {
      map.set(romName, [...map.get(romName) as File[], romFile]);
    } else {
      map.set(romName, [romFile]);
    }
    return map;
  }, new Map<string, File[]>());

  return [...romFilesByName.entries()]
    .reduce(async (accPromise, [romName, romFiles]) => {
      const acc = await accPromise;

      const game = new Game();
      const parent = new Parent(romName, game);
      const releaseCandidates = await Promise.all(romFiles
        .map(async (romFile) => {
          const release = new Release(romName, 'UNK', undefined);
          const romFileName = romFile.getExtractedFilePath();
          const rom = new ROM(
            path.basename(romFileName),
            await romFile.getCrc32(),
          );
          return new ReleaseCandidate(game, release, [rom], [romFile]);
        }));
      acc.set(parent, releaseCandidates);

      return acc;
    }, Promise.resolve(new Map<Parent, ReleaseCandidate[]>()));
}

async function runRomWriter(
  outputTemp: string,
  optionProps: OptionsProps,
  parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
): Promise<string[]> {
  const options = new Options({
    output: outputTemp,
    ...optionProps,
  });
  const dat = new DAT(new Header(), []);

  const writtenRoms = await new ROMWriter(options, new ProgressBarFake())
    .write(dat, parentsToCandidates);

  return [...writtenRoms.values()]
    .flatMap((romFiles) => romFiles.map((romFile) => romFile.getFilePath()))
    .filter((filePath, idx, filePaths) => filePaths.indexOf(filePath) === idx)
    .map((filePath) => filePath.replace(outputTemp + path.sep, ''))
    .sort() as string[];
}

it('shouldn\'t write anything if no parents', async () => {
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

  const writtenPaths = await runRomWriter(os.devNull, {
    commands: ['copy'],
  }, parentsToCandidates);
  expect(writtenPaths).toHaveLength(0);
});

it('shouldn\'t write anything if parents have no candidates', async () => {
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();
  parentsToCandidates.set(new Parent('none', []), []);

  const writtenPaths = await runRomWriter(os.devNull, {
    commands: ['copy'],
  }, parentsToCandidates);
  expect(writtenPaths).toHaveLength(0);
});

it('shouldn\'t write anything if not copying or moving', async () => {
  await copyFixturesToTemp(async (inputTemp, outputTemp) => {
    // Make sure we started with some input ROMs
    const inputFiles = fsPoly.walkSync(inputTemp);
    expect(inputFiles.length).toBeGreaterThan(0);

    const parentsToCandidates = await indexFilesByName(inputTemp, 'zip/*');

    const writtenPaths = await runRomWriter(outputTemp, {
      commands: [],
    }, parentsToCandidates);
    expect(writtenPaths).toHaveLength(0);

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

      const zipDir = path.join(inputTemp, 'zip');
      const parentsToCandidates = await indexFilesByName(zipDir, '*');

      const writtenPaths = await runRomWriter(zipDir, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
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

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(secondWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
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

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
        overwrite: true,
      }, parentsToCandidates);
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

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      const existingZip = new AdmZip();
      existingZip.addFile('something.rom', Buffer.from('something'));
      existingZip.writeZip(path.join(outputTemp, 'fizzbuzz.zip'));
      existingZip.writeZip(path.join(outputTemp, 'foobar.zip'));

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
        overwrite: true,
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test everything', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test 7z inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, '7z/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test raw inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, 'raw/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test zip inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, 'zip/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should move, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await indexFilesByName(rawDir, '*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['move', 'zip', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.zip',
        'fizzbuzz.zip',
        'foobar.zip',
        'loremipsum.zip',
        'unknown.zip',
      ]);

      expect(fsPoly.walkSync(rawDir)).toHaveLength(0);
    });
  });
});

describe('raw', () => {
  it('shouldn\'t write anything if output matches input', async () => {
    await copyFixturesToTemp(async (inputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await indexFilesByName(rawDir, '*');

      const writtenPaths = await runRomWriter(rawDir, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
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

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(secondWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
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

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      // Write once
      const firstWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(firstWrittenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Write again without overwriting
      const secondWrittenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
        overwrite: true,
      }, parentsToCandidates);
      expect(secondWrittenPaths).toEqual(firstWrittenPaths);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test everything', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, '**/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test 7z inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, '7z/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test raw inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, 'raw/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should copy, zip, and test zip inputs', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const parentsToCandidates = await indexFilesByName(inputTemp, 'zip/*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['copy', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      // Make sure we didn't alter the input ROMs
      expect(fsPoly.walkSync(inputTemp)).toEqual(inputFiles);
    });
  });

  it('should move, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Make sure we started with some input ROMs
      const inputFiles = fsPoly.walkSync(inputTemp);
      expect(inputFiles.length).toBeGreaterThan(0);

      const rawDir = path.join(inputTemp, 'raw');
      const parentsToCandidates = await indexFilesByName(rawDir, '*');

      const writtenPaths = await runRomWriter(outputTemp, {
        commands: ['move', 'test'],
      }, parentsToCandidates);
      expect(writtenPaths).toEqual([
        'empty.rom',
        'fizzbuzz.rom',
        'foobar.rom',
        'loremipsum.rom',
        'unknown.rom',
      ]);

      expect(fsPoly.walkSync(rawDir)).toHaveLength(0);
    });
  });
});
