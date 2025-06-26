import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../src/async/driveSemaphore.js';
import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import CandidatePatchGenerator from '../../../src/modules/candidates/candidatePatchGenerator.js';
import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import DATScanner from '../../../src/modules/dats/datScanner.js';
import PatchScanner from '../../../src/modules/patchScanner.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import DAT from '../../../src/types/dats/dat.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options from '../../../src/types/options.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

// Run DATGameInferrer, but condense all DATs down to one
async function buildInferredDat(options: Options, romFiles: File[]): Promise<DAT> {
  const dats = await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);
  return new DATCombiner(new ProgressBarFake()).combine(dats);
}

async function runPatchCandidateGenerator(dat: DAT, romFiles: File[]): Promise<WriteCandidate[]> {
  const options = new Options({
    commands: ['extract'],
    patch: [path.join('test', 'fixtures', 'patches')],
  });

  const indexedRomFiles = new ROMIndexer(options, new ProgressBarFake()).index(romFiles);
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new MappableSemaphore(2),
  ).generate(dat, indexedRomFiles);

  const patches = await new PatchScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(2),
  ).scan();

  return new CandidatePatchGenerator(new ProgressBarFake()).generate(dat, candidates, patches);
}

it('should do nothing with no games', async () => {
  // Given
  const dat = new LogiqxDAT({ header: new Header() });

  // When
  const candidates = await runPatchCandidateGenerator(dat, []);

  // Then
  expect(candidates).toHaveLength(0);
});

describe('with inferred DATs', () => {
  it('should do nothing with no relevant patches', async () => {
    // Given
    const options = new Options({
      input: [path.join('test', 'fixtures', 'roms', 'headered')],
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(2),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then
    expect(candidates).toHaveLength(6);
  });

  it('should create patch candidates with relevant patches', async () => {
    // Given
    const options = new Options({
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(2),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then candidates have doubled
    expect(candidates).toHaveLength(romFiles.length * 2);
  });
});

describe('with explicit DATs', () => {
  it('should maintain game and ROM paths from HTGD DATs', async () => {
    // Given
    const options = new Options({
      dat: [path.join('test', 'fixtures', 'dats', 'smdb*')],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const dat = (
      await new DATScanner(
        options,
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
        new DriveSemaphore(2),
      ).scan()
    )[0];
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(2),
    ).scan();

    // And pre-assert all Game names and ROM names have path separators in them
    const totalRoms = dat.getGames().reduce((gameSum, game) => gameSum + game.getRoms().length, 0);
    expect(totalRoms).toBeGreaterThan(0);
    dat.getGames().forEach((game) => {
      expect(/[\\/]/.exec(game.getName())).toBeTruthy();
      game.getRoms().forEach((rom) => {
        expect(/[\\/]/.exec(rom.getName())).toBeTruthy();
      });
    });

    // When
    const candidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then all Game names and ROM names should maintain their path separators
    candidates.forEach((candidate) => {
      expect(/[\\/]/.exec(candidate.getGame().getName())).toBeTruthy();
      candidate.getRomsWithFiles().forEach((romWithFiles) => {
        expect(/[\\/]/.exec(romWithFiles.getRom().getName())).toBeTruthy();
      });
    });
  });
});
